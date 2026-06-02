/**
 * @module server/rpc/handler
 * Aggregates the Effect RPC handler implementations for the application API
 * and exposes a layer suitable for the production RPC server (U7) and the
 * in-memory test client (`RpcTest.makeClient`).
 *
 * U5 adds the realtime player/queue handlers (including streaming RPCs) so
 * the production layer now covers every tag in {@link PyxisRpc}. The
 * {@link NonRealtimeRpc} alias is retained for the existing handler-level
 * tests that only exercise the non-realtime endpoint families.
 */

import type { ApiPublicError } from "@shared/api/contracts/common.js";
import { PyxisRpc } from "@shared/api/rpc.js";
import { createLogger } from "@shared/logger.js";
import { Effect, Layer } from "effect";
import {
  internalDefect,
  type PublicError,
  toApiPublicError,
} from "./errors.js";
import { albumHandlers } from "./handlers/album.js";
import { artistHandlers } from "./handlers/artist.js";
import { authHandlers } from "./handlers/auth.js";
import { libraryHandlers } from "./handlers/library.js";
import { listenLogHandlers } from "./handlers/listenLog.js";
import { logHandlers } from "./handlers/log.js";
import { playerHandlers } from "./handlers/player.js";
import { playlistHandlers } from "./handlers/playlist.js";
import { queueHandlers } from "./handlers/queue.js";
import { radioHandlers } from "./handlers/radio.js";
import { searchHandlers } from "./handlers/search.js";
import { trackHandlers } from "./handlers/track.js";
import { AuthSession, AuthSessionLayerLive } from "./services/authSession.js";
import { Library, LibraryLayerLive } from "./services/library.js";
import { Player, PlayerLayerLive } from "./services/player.js";
import { Queue, QueueLayerLive } from "./services/queue.js";
import { Radio, RadioLayerLive } from "./services/radio.js";
import {
  SourceCatalog,
  SourceCatalogLayerLive,
} from "./services/sourceCatalog.js";
import { mapUnknownError } from "./sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.handler" });

/**
 * RPC tags owned by the realtime player + queue handler families (added
 * in U5). They remain exported so the non-realtime test surface
 * ({@link NonRealtimeRpc}) and any later tagging logic can reference the
 * canonical list of realtime tags in one place.
 */
export const REALTIME_RPC_TAGS = [
  "player.state.get",
  "player.transport.play",
  "player.transport.pause",
  "player.transport.resume",
  "player.transport.stop",
  "player.transport.skip",
  "player.transport.previous",
  "player.transport.jumpTo",
  "player.transport.seek",
  "player.volume.set",
  "player.progress.report",
  "player.duration.report",
  "player.audioError.report",
  "player.transport.trackEnded",
  "player.state.stream",
  "queue.state.get",
  "queue.tracks.add",
  "queue.track.remove",
  "queue.tracks.clear",
  "queue.cursor.jump",
  "queue.tracks.shuffle",
  "queue.state.stream",
] as const;

/**
 * Application RPC group restricted to the non-realtime endpoint families.
 * The non-realtime handler test (`handler.test.ts`) builds a layer against
 * this projection so it can keep using `RpcTest.makeClient` without wiring
 * the realtime player/queue services.
 */
export const NonRealtimeRpc = PyxisRpc.omit(...REALTIME_RPC_TAGS);

const PUBLIC_ERROR_TAGS = new Set<string>([
  "ValidationError",
  "Unauthorized",
  "AuthRefreshFailed",
  "NotFound",
  "SourceUnavailable",
  "PersistenceError",
  "UpstreamProviderError",
  "StaleCommand",
  "StaleReport",
  "Defect",
]);

function isPublicError(err: unknown): err is PublicError {
  if (typeof err !== "object" || err === null) return false;
  const tag = (err as { _tag?: unknown })._tag;
  return typeof tag === "string" && PUBLIC_ERROR_TAGS.has(tag);
}

/**
 * Coerce an arbitrary handler failure into a typed {@link PublicError}.
 * Already-typed values pass through; everything else falls into
 * {@link mapUnknownError} so the wire never sees a raw cause.
 */
export function normalizePublicError(err: unknown): PublicError {
  if (isPublicError(err)) return err;
  return mapUnknownError(err);
}

/**
 * Standard handler boundary wrapper. Maps every failure of `eff` into the
 * wire-encoded {@link ApiPublicError} surface and redacts unexpected defects
 * into the canonical internal-defect payload (raw cause logged server-side).
 *
 * Handler bodies use this so they can fail with the typed {@link PublicError}
 * union and trust the wire encoder to see only allow-listed fields.
 */
export const publicHandler = <A, R>(
  eff: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, ApiPublicError, R> =>
  eff.pipe(
    Effect.catchDefect((cause) => {
      log.error({ err: cause }, "unexpected handler defect");
      return Effect.fail(internalDefect());
    }),
    Effect.mapError((err) => toApiPublicError(normalizePublicError(err))),
  );

/**
 * Build the handler layer for {@link NonRealtimeRpc}. Each per-family
 * handler module already wraps its bodies in {@link publicHandler}, so the
 * resulting layer only needs to inject the service dependencies.
 *
 * Per-family handlers are loosely typed `Effect<unknown, unknown>` inside
 * each module so they can compose existing Promise-based source manager and
 * Pandora helpers; the schema-driven RPC framework validates success and
 * error shapes at the wire boundary on encode/decode. The single `as never`
 * cast keeps that runtime contract authoritative without losing dependency
 * inference on the resulting layer.
 */
export const NonRealtimeRpcHandlersLayer = NonRealtimeRpc.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthSession;
    const library = yield* Library;
    const catalog = yield* SourceCatalog;
    const radio = yield* Radio;
    const handlers = {
      ...authHandlers({ auth }),
      ...libraryHandlers({ auth, library, catalog }),
      ...albumHandlers({ catalog }),
      ...artistHandlers({ catalog }),
      ...searchHandlers({ auth, catalog }),
      ...radioHandlers({ radio }),
      ...playlistHandlers({ auth, catalog }),
      ...trackHandlers({ auth, catalog }),
      ...listenLogHandlers(),
      ...logHandlers(),
    };
    return handlers as never;
  }),
);

/**
 * Build the handler layer for the full {@link PyxisRpc} group. Includes the
 * realtime player + queue handlers added in U5 alongside the non-realtime
 * families wired through {@link NonRealtimeRpcHandlersLayer}.
 */
export const PyxisRpcHandlersLayer = PyxisRpc.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthSession;
    const library = yield* Library;
    const catalog = yield* SourceCatalog;
    const radio = yield* Radio;
    const player = yield* Player;
    const queue = yield* Queue;
    const handlers = {
      ...authHandlers({ auth }),
      ...libraryHandlers({ auth, library, catalog }),
      ...albumHandlers({ catalog }),
      ...artistHandlers({ catalog }),
      ...searchHandlers({ auth, catalog }),
      ...radioHandlers({ radio }),
      ...playlistHandlers({ auth, catalog }),
      ...trackHandlers({ auth, catalog }),
      ...listenLogHandlers(),
      ...logHandlers(),
      ...playerHandlers({ player, queue }),
      ...queueHandlers({ queue }),
    };
    return handlers as never;
  }),
);

/**
 * Production layer composition for the full handler set. Provides every
 * service contract the handlers depend on. U7 mounts this on the HTTP
 * route as the application's only RPC runtime.
 */
export const PyxisRpcLayerLive = PyxisRpcHandlersLayer.pipe(
  Layer.provide(LibraryLayerLive),
  Layer.provide(SourceCatalogLayerLive),
  Layer.provide(RadioLayerLive),
  Layer.provide(AuthSessionLayerLive),
  Layer.provide(PlayerLayerLive),
  Layer.provide(QueueLayerLive),
);
