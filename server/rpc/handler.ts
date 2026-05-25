/**
 * @module server/rpc/handler
 * Aggregates the Effect RPC handler implementations for the application API
 * and exposes a layer suitable for the production RPC server (U7) and the
 * in-memory test client (`RpcTest.makeClient`).
 *
 * Player and queue handlers (including the realtime streaming RPCs) land in
 * U5. To keep this layer typecheckable while U5 is still in flight, the U4
 * layer is built against {@link NonRealtimeRpc} — the application RPC group
 * with all `player.*` and `queue.*` tags omitted. U5 will replace
 * {@link NonRealtimeRpc} / {@link PyxisRpcLayerLive} with the full layer.
 */

import { Effect, Layer } from "effect";
import type { ApiPublicError } from "../../src/api/contracts/common.js";
import { PyxisRpc } from "../../src/api/rpc.js";
import { createLogger } from "../../src/logger.js";
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
import { playlistHandlers } from "./handlers/playlist.js";
import { radioHandlers } from "./handlers/radio.js";
import { searchHandlers } from "./handlers/search.js";
import { trackHandlers } from "./handlers/track.js";
import { AuthSession, AuthSessionLayerLive } from "./services/authSession.js";
import { Library, LibraryLayerLive } from "./services/library.js";
import {
	SourceCatalog,
	SourceCatalogLayerLive,
} from "./services/sourceCatalog.js";
import { mapUnknownError } from "./sourceErrorMap.js";

const log = createLogger("server").child({ component: "rpc.handler" });

/** RPC tags landing in U5 (player + queue, including streams). */
export const REALTIME_RPC_TAGS = [
	"player.state.get",
	"player.play",
	"player.pause",
	"player.resume",
	"player.stop",
	"player.skip",
	"player.previous",
	"player.jumpTo",
	"player.seek",
	"player.volume.set",
	"player.progress.report",
	"player.duration.report",
	"player.audioError.report",
	"player.trackEnded",
	"player.state.stream",
	"queue.state.get",
	"queue.tracks.add",
	"queue.track.remove",
	"queue.clear",
	"queue.jump",
	"queue.shuffle",
	"queue.state.stream",
] as const;

/**
 * Application RPC group restricted to U4's non-realtime endpoint families.
 * U5 will swap callers to {@link PyxisRpc} directly once player/queue
 * handlers land.
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
export const NonRealtimeHandlersLayer = NonRealtimeRpc.toLayer(
	Effect.gen(function* () {
		const auth = yield* AuthSession;
		const library = yield* Library;
		const catalog = yield* SourceCatalog;
		const handlers = {
			...authHandlers({ auth }),
			...libraryHandlers({ auth, library, catalog }),
			...albumHandlers({ catalog }),
			...artistHandlers({ catalog }),
			...searchHandlers({ auth, catalog }),
			...radioHandlers({ auth }),
			...playlistHandlers({ auth, catalog }),
			...trackHandlers({ auth }),
			...listenLogHandlers(),
			...logHandlers(),
		};
		return handlers as never;
	}),
);

/**
 * Production layer composition for the non-realtime handler set. Provides
 * all the service contracts the handlers depend on. U5 / U7 extend this
 * with the player + queue services and mount it on the HTTP route.
 */
export const PyxisRpcLayerLive = NonRealtimeHandlersLayer.pipe(
	Layer.provide(AuthSessionLayerLive),
	Layer.provide(LibraryLayerLive),
	Layer.provide(SourceCatalogLayerLive),
);
