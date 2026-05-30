/**
 * @module server/rpc/middleware
 * Shared Effect-flavoured request middleware used by handlers (built in U4).
 *
 * The previous tRPC `pandoraProtectedProcedure` baked in three behaviors:
 *  1. require a Pandora session for the call,
 *  2. expose the session + source manager to the handler,
 *  3. retry the handler once on a known Pandora auth error.
 *
 * `withPandoraSession` here is the Effect equivalent: handlers wrap their
 * inner effect in a function that receives an {@link RpcSessionContext} and
 * inherit the same coalesce-and-refresh semantics from
 * {@link AuthSession.withAuthRetry}.
 */

import { Effect } from "effect";
import { createLogger } from "@shared/logger.js";
import type { RpcSessionContext } from "./context.js";
import {
  type AuthRefreshFailed,
  type Defect,
  internalDefect,
  type PublicError,
  type Unauthorized,
} from "./errors.js";
import { AuthSession } from "./services/authSession.js";
import { mapUnknownError } from "./sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.middleware" });

/**
 * Run a handler with a guaranteed Pandora session. Auth errors from the
 * inner handler trigger one coalesced refresh + retry. Non-auth errors
 * propagate unchanged.
 */
export const withPandoraSession =
  <A, E, R>(handler: (ctx: RpcSessionContext) => Effect.Effect<A, E, R>) =>
  (): Effect.Effect<A, E | Unauthorized | AuthRefreshFailed, R | AuthSession> =>
    Effect.gen(function* () {
      const auth = yield* AuthSession;
      return yield* auth.withAuthRetry(handler);
    });

/**
 * Redact-and-log unexpected throws. Use as the outer wrapper for any
 * handler that may surface failures we have not yet mapped through
 * {@link mapUnknownError}; raw causes are logged server-side and a generic
 * {@link Defect} is returned to the client.
 */
export const redactDefects = <A, E extends PublicError, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Defect, R> =>
  effect.pipe(
    Effect.catchDefect((cause) => {
      log.error({ err: cause }, "unexpected handler defect");
      return Effect.fail(internalDefect());
    }),
  );

/** Re-export for handler convenience. */
export { mapUnknownError };
