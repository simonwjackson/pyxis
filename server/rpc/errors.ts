/**
 * @module server/rpc/errors
 * Effect tagged errors mirroring `PublicErrorSchema` in
 * `src/api/contracts/common.ts`.
 *
 * Services and handlers use these as their typed failure channel so that the
 * RPC layer (U4) can encode them through the schema without leaking raw
 * causes. Each tag matches the corresponding `_tag` literal in the contract.
 */

import { Data } from "effect";
import type {
  ApiPublicError,
  ApiSourceType,
} from "@shared/api/contracts/common.js";

/** Input failed schema validation or domain-specific shape checks. */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly code: string;
  readonly field?: string;
}> {}

/** Caller is not authenticated for the requested operation. */
export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly code: string;
}> {}

/** Pandora session refresh attempt failed (rate cap, login error, etc.). */
export class AuthRefreshFailed extends Data.TaggedError("AuthRefreshFailed")<{
  readonly code: string;
}> {}

/** Requested resource (album, playlist, track, station) does not exist. */
export class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string;
}> {}

/** Source is missing/disabled/unavailable for this request. */
export class SourceUnavailable extends Data.TaggedError("SourceUnavailable")<{
  readonly code: string;
  readonly source?: ApiSourceType;
}> {}

/** Persistence (DB / file) operation failed. */
export class PersistenceError extends Data.TaggedError("PersistenceError")<{
  readonly code: string;
}> {}

/** Upstream provider rejected a call (Pandora API code, YT failure, etc.). */
export class UpstreamProviderError extends Data.TaggedError(
  "UpstreamProviderError",
)<{
  readonly source: ApiSourceType;
  readonly code?: string;
}> {}

/** Command arrived too late for the current player state. */
export class StaleCommand extends Data.TaggedError("StaleCommand")<{
  readonly code: string;
}> {}

/** Progress / duration / ended report arrived too late for the current track. */
export class StaleReport extends Data.TaggedError("StaleReport")<{
  readonly code: string;
}> {}

/** Unknown defect; raw cause is logged server-side only. */
export class Defect extends Data.TaggedError("Defect")<{
  readonly code: "internal_defect";
}> {}

/**
 * Union of every public error a handler may surface. The shape mirrors
 * `PublicErrorSchema` so encoding from this union is mechanical at the RPC
 * boundary in U4.
 */
export type PublicError =
  | ValidationError
  | Unauthorized
  | AuthRefreshFailed
  | NotFound
  | SourceUnavailable
  | PersistenceError
  | UpstreamProviderError
  | StaleCommand
  | StaleReport
  | Defect;

/** A defect with the canonical redacted code; raw cause is logged separately. */
export const internalDefect = (): Defect =>
  new Defect({ code: "internal_defect" });

/**
 * Convert a {@link PublicError} into the wire-encoded
 * {@link ApiPublicError} payload. The mapping is lossless for fields
 * the contract exposes; everything else is dropped server-side.
 */
export function toApiPublicError(error: PublicError): ApiPublicError {
  switch (error._tag) {
    case "ValidationError":
      return error.field !== undefined
        ? { _tag: "ValidationError", code: error.code, field: error.field }
        : { _tag: "ValidationError", code: error.code };
    case "Unauthorized":
      return { _tag: "Unauthorized", code: error.code };
    case "AuthRefreshFailed":
      return { _tag: "AuthRefreshFailed", code: error.code };
    case "NotFound":
      return { _tag: "NotFound", resource: error.resource };
    case "SourceUnavailable":
      return error.source !== undefined
        ? { _tag: "SourceUnavailable", code: error.code, source: error.source }
        : { _tag: "SourceUnavailable", code: error.code };
    case "PersistenceError":
      return { _tag: "PersistenceError", code: error.code };
    case "UpstreamProviderError":
      return error.code !== undefined
        ? {
            _tag: "UpstreamProviderError",
            source: error.source,
            code: error.code,
          }
        : { _tag: "UpstreamProviderError", source: error.source };
    case "StaleCommand":
      return { _tag: "StaleCommand", code: error.code };
    case "StaleReport":
      return { _tag: "StaleReport", code: error.code };
    case "Defect":
      return { _tag: "Defect", code: "internal_defect" };
  }
}
