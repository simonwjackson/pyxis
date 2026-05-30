/**
 * @module server/rpc/sourceErrorMap
 * Central seam for converting provider, source, and persistence failures into
 * typed {@link PublicError} values. Handlers and services route every
 * potentially user-facing failure through this module so the RPC boundary
 * never echoes raw causes (stack traces, provider URLs, secret tokens) to
 * clients.
 *
 * Unknown defects are intentionally collapsed into {@link Defect}; callers
 * must log the raw cause server-side before mapping.
 */

import {
  ApiCallError,
  ConfigError,
  type PandoraError,
  NotFoundError as PandoraNotFoundError,
  PartnerLoginError,
  SessionError,
  UserLoginError,
} from "../../src/sources/pandora/types/errors.js";
import {
  AuthRefreshFailed,
  Defect,
  NotFound,
  PersistenceError,
  type PublicError,
  SourceUnavailable,
  Unauthorized,
  UpstreamProviderError,
} from "./errors.js";

/** Pandora error codes that indicate an expired/invalid session. */
export const PANDORA_AUTH_ERROR_CODES: ReadonlySet<number> = new Set([
  0, 1001, 1002,
]);

/**
 * True when the supplied error is an {@link ApiCallError} whose code matches
 * a Pandora authentication failure (expired session, invalid auth token).
 */
export function isPandoraAuthError(err: unknown): err is ApiCallError {
  return (
    err instanceof ApiCallError &&
    err.code != null &&
    PANDORA_AUTH_ERROR_CODES.has(err.code)
  );
}

/**
 * Map a Pandora-typed error to the public RPC error surface.
 * `ApiCallError` with an auth code is mapped to {@link Unauthorized}; other
 * `ApiCallError` instances become {@link UpstreamProviderError}.
 */
export function mapPandoraError(error: PandoraError): PublicError {
  if (error instanceof ApiCallError) {
    if (error.code != null && PANDORA_AUTH_ERROR_CODES.has(error.code)) {
      return new Unauthorized({ code: "pandora_unauthorized" });
    }
    return new UpstreamProviderError({
      source: "pandora",
      code:
        error.code != null ? `pandora_${error.code}` : "pandora_api_call_error",
    });
  }
  if (error instanceof PandoraNotFoundError) {
    return new NotFound({ resource: "pandora_resource" });
  }
  if (error instanceof SessionError) {
    return new Unauthorized({ code: "pandora_session_invalid" });
  }
  if (error instanceof PartnerLoginError || error instanceof UserLoginError) {
    return new AuthRefreshFailed({ code: "pandora_login_failed" });
  }
  if (error instanceof ConfigError) {
    return new SourceUnavailable({
      source: "pandora",
      code: "pandora_config_missing",
    });
  }
  return new UpstreamProviderError({ source: "pandora" });
}

/**
 * Wrap a persistence failure under a typed {@link PersistenceError}. Specific
 * underlying error types are intentionally not exposed.
 */
export function mapPersistenceError(_error: unknown): PublicError {
  return new PersistenceError({ code: "persistence_failure" });
}

/**
 * Best-effort mapping for arbitrary upstream errors. Pandora-typed errors are
 * routed through {@link mapPandoraError}; anything else collapses to a
 * redacted {@link Defect} so the raw cause never reaches the wire. Callers
 * must log the raw cause server-side before invoking this.
 */
export function mapUnknownError(error: unknown): PublicError {
  if (
    error instanceof ApiCallError ||
    error instanceof PandoraNotFoundError ||
    error instanceof SessionError ||
    error instanceof PartnerLoginError ||
    error instanceof UserLoginError ||
    error instanceof ConfigError
  ) {
    return mapPandoraError(error as PandoraError);
  }
  return new Defect({ code: "internal_defect" });
}
