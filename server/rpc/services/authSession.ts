/**
 * @module server/rpc/services/authSession
 * Effect service contract centralizing Pandora credentials, session, and
 * source-manager refresh behavior.
 *
 * RPC handlers (U4), the auto-fetch handler in `autoLogin`, and any restored
 * playback path call through this service so Pandora refresh semantics live
 * in one place:
 *
 * - require credentials before declaring a session
 * - coalesce concurrent refresh attempts so only one login flight runs
 * - rate-cap repeated failures so a broken provider does not spin
 * - retry once on a known Pandora auth error
 * - map all internals to typed {@link PublicError} values
 *
 * The live layer wraps the existing module-level credentials/sourceManager
 * helpers; the in-memory layer accepts a configurable behavior record so
 * tests can drive refresh outcomes without mocking.
 */

import { Context, Effect, Layer } from "effect";
import { createLogger } from "@shared/logger.js";
import type { SourceManager } from "@shared/sources/index.js";
import type { PandoraSession } from "@shared/sources/pandora/client.js";
import {
  getPandoraSessionFromCredentials,
  refreshPandoraSession as runRefreshPandoraSession,
  setPandoraSession,
} from "../../services/credentials.js";
import {
  ensureSourceManager,
  getSourceManager as resolveSourceManagerForSession,
} from "../../services/sourceManager.js";
import type { RpcSessionContext } from "../context.js";
import {
  AuthRefreshFailed,
  SourceUnavailable,
  Unauthorized,
} from "../errors.js";
import { isPandoraAuthError, mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.authSession" });

/** Default minimum delay between failed refresh attempts (rate cap). */
export const DEFAULT_REFRESH_COOLDOWN_MS = 30_000;

/**
 * Surface exposed by the AuthSession service.
 */
export type AuthSessionShape = {
  /** Current Pandora session, undefined when not logged in. */
  readonly getSession: Effect.Effect<PandoraSession | undefined>;

  /**
   * Require a Pandora session for the current request. Fails with
   * {@link Unauthorized} when no credentials are configured.
   */
  readonly requireSession: Effect.Effect<RpcSessionContext, Unauthorized>;

  /**
   * Resolve a source manager. Uses the authenticated manager when a session
   * exists; otherwise falls back to the YTMusic-only manager.
   */
  readonly getSourceManager: Effect.Effect<SourceManager, SourceUnavailable>;

  /**
   * Refresh the Pandora session. Concurrent callers share one in-flight
   * attempt. Repeated failures are rate-capped to {@link DEFAULT_REFRESH_COOLDOWN_MS}.
   */
  readonly refresh: Effect.Effect<PandoraSession, AuthRefreshFailed>;

  /**
   * Convenience wrapper: run an effect that may fail with a known Pandora
   * auth error and, if it does, refresh once and retry with a fresh session
   * and source manager. Non-auth errors propagate unchanged.
   */
  readonly withAuthRetry: <A, E, R>(
    f: (ctx: RpcSessionContext) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Unauthorized | AuthRefreshFailed, R>;
};

/**
 * Effect Context.Service tag for {@link AuthSessionShape}. Use
 * `yield* AuthSession` to access the shape inside an effect.
 */
export class AuthSession extends Context.Service<
  AuthSession,
  AuthSessionShape
>()("Pyxis/AuthSession") {}

/**
 * Configuration for an in-memory AuthSession layer. Tests describe the
 * desired refresh outcome and starting session/source-manager rather than
 * mocking individual helpers.
 */
export type AuthSessionBehavior = {
  /** Current session accessor; called fresh on every observation. */
  readonly getSession: () => PandoraSession | undefined;
  /** Replace the current session after a successful refresh. */
  readonly setSession: (session: PandoraSession) => void;
  /** Resolve the source manager bound to an authenticated session. */
  readonly sourceManagerForSession: (
    session: PandoraSession,
  ) => Promise<SourceManager>;
  /** Resolve the fallback source manager when no session is configured. */
  readonly sourceManagerFallback: () => Promise<SourceManager>;
  /** Run a refresh attempt; returns the fresh session or undefined on failure. */
  readonly refresh: () => Promise<PandoraSession | undefined>;
  /** Rate-cap window. */
  readonly cooldownMs?: number;
  /** Time source for the rate cap. */
  readonly now?: () => number;
};

type RefreshState = {
  inFlight: Promise<PandoraSession | undefined> | undefined;
  lastFailureAt: number;
};

/**
 * Build the shape from a behavior. Used by both the live layer and test
 * layers; keeps coalescing + rate-cap logic in one place.
 */
function makeShape(behavior: AuthSessionBehavior): AuthSessionShape {
  const cooldownMs = behavior.cooldownMs ?? DEFAULT_REFRESH_COOLDOWN_MS;
  const now = behavior.now ?? Date.now;
  const state: RefreshState = {
    inFlight: undefined,
    lastFailureAt: 0,
  };

  const getSession = Effect.sync(() => behavior.getSession());

  const resolveManagerForSession = (session: PandoraSession) =>
    Effect.tryPromise({
      try: () => behavior.sourceManagerForSession(session),
      catch: (cause) => {
        log.error(
          { err: cause },
          "failed to resolve source manager for session",
        );
        return new SourceUnavailable({
          code: "source_manager_unavailable",
        });
      },
    });

  const requireSession = Effect.gen(function* () {
    const session = behavior.getSession();
    if (!session) {
      return yield* Effect.fail(
        new Unauthorized({ code: "pandora_credentials_required" }),
      );
    }
    const manager = yield* Effect.catch(resolveManagerForSession(session), () =>
      Effect.fail(
        new Unauthorized({ code: "pandora_source_manager_unavailable" }),
      ),
    );
    return {
      pandoraSession: session,
      sourceManager: manager,
    } satisfies RpcSessionContext;
  });

  const getSourceManager = Effect.gen(function* () {
    const session = behavior.getSession();
    if (session) {
      return yield* resolveManagerForSession(session);
    }
    return yield* Effect.tryPromise({
      try: () => behavior.sourceManagerFallback(),
      catch: (cause) => {
        log.error({ err: cause }, "failed to resolve fallback source manager");
        return new SourceUnavailable({
          code: "source_manager_unavailable",
        });
      },
    });
  });

  const refresh = Effect.gen(function* () {
    // Rate-cap: do not retry within the cooldown after a failure.
    const since = now() - state.lastFailureAt;
    if (state.lastFailureAt !== 0 && since < cooldownMs) {
      return yield* Effect.fail(
        new AuthRefreshFailed({ code: "refresh_rate_capped" }),
      );
    }

    // Coalesce concurrent refresh attempts onto a single in-flight promise.
    if (!state.inFlight) {
      state.inFlight = behavior
        .refresh()
        .then((session) => {
          if (session) {
            behavior.setSession(session);
            state.lastFailureAt = 0;
          } else {
            state.lastFailureAt = now();
          }
          return session;
        })
        .catch((cause) => {
          state.lastFailureAt = now();
          log.warn({ err: cause }, "pandora session refresh threw");
          return undefined;
        })
        .finally(() => {
          state.inFlight = undefined;
        });
    }

    const inFlight = state.inFlight;
    if (!inFlight) {
      return yield* Effect.fail(
        new AuthRefreshFailed({ code: "refresh_failed" }),
      );
    }
    const session = yield* Effect.promise(() => inFlight);
    if (!session) {
      return yield* Effect.fail(
        new AuthRefreshFailed({ code: "refresh_failed" }),
      );
    }
    return session;
  });

  const withAuthRetry = <A, E, R>(
    f: (ctx: RpcSessionContext) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | Unauthorized | AuthRefreshFailed, R> =>
    Effect.gen(function* () {
      const session = behavior.getSession();
      if (!session) {
        return yield* Effect.fail(
          new Unauthorized({ code: "pandora_credentials_required" }),
        );
      }
      const initialManager = yield* Effect.catch(
        resolveManagerForSession(session),
        () =>
          Effect.fail(
            new Unauthorized({ code: "pandora_source_manager_unavailable" }),
          ),
      );

      return yield* Effect.catch(
        f({ pandoraSession: session, sourceManager: initialManager }),
        (err) => {
          if (!isPandoraAuthError(err)) {
            return Effect.fail(err as E);
          }
          log.warn(
            { code: (err as { code?: number }).code },
            "pandora auth error; refreshing session",
          );
          return Effect.gen(function* () {
            const fresh = yield* refresh;
            const freshManager = yield* Effect.catch(
              resolveManagerForSession(fresh),
              () =>
                Effect.fail(
                  new AuthRefreshFailed({
                    code: "refresh_source_manager_failed",
                  }),
                ),
            );
            return yield* f({
              pandoraSession: fresh,
              sourceManager: freshManager,
            });
          });
        },
      );
    });

  return {
    getSession,
    requireSession,
    getSourceManager,
    refresh,
    withAuthRetry,
  };
}

/**
 * Build an AuthSession layer from a configurable behavior. Tests construct
 * this directly with controllable refresh outcomes; the live layer wraps
 * the production module-level helpers.
 */
export function AuthSessionLayerFromBehavior(
  behavior: AuthSessionBehavior,
): Layer.Layer<AuthSession> {
  return Layer.sync(AuthSession)(() => makeShape(behavior));
}

/**
 * Live AuthSession layer. Wraps the module-level credential and source
 * manager helpers so production wiring continues to share state with the
 * existing auto-login / restored playback flows.
 */
export const AuthSessionLayerLive: Layer.Layer<AuthSession> = Layer.sync(
  AuthSession,
)(() =>
  makeShape({
    getSession: () => getPandoraSessionFromCredentials(),
    setSession: (session) => {
      // The credentials module already updates the session inside
      // `runRefreshPandoraSession`; this is the path for refreshers
      // that bypass that helper (test layers don't reach here).
      setPandoraSession(session);
    },
    sourceManagerForSession: (session) =>
      resolveSourceManagerForSession(session),
    sourceManagerFallback: () => ensureSourceManager(),
    refresh: () => runRefreshPandoraSession(),
  }),
);

/**
 * Re-exported helpers for handlers/tests that need to catch raw provider
 * errors and map them through the public error surface.
 */
export { isPandoraAuthError, mapUnknownError };
