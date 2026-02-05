/**
 * @module router
 * Combined tRPC router aggregating all domain-specific routers.
 * Provides the unified API surface for the Pyxis music server.
 */

import { router } from "./trpc.js";
import { authRouter } from "./routers/auth.js";
import { trackRouter } from "./routers/track.js";
import { albumRouter } from "./routers/album.js";
import { artistRouter } from "./routers/artist.js";
import { radioRouter } from "./routers/radio.js";
import { playlistRouter } from "./routers/playlist.js";
import { libraryRouter } from "./routers/library.js";
import { searchRouter } from "./routers/search.js";
import { playerRouter } from "./routers/player.js";
import { queueRouter } from "./routers/queue.js";
import { logRouter } from "./routers/log.js";

/**
 * Combined tRPC application router containing all API endpoints.
 * Merges domain routers: auth, track, album, artist, radio, playlist,
 * library, search, player, queue, and log.
 */
export const appRouter = router({
	auth: authRouter,
	track: trackRouter,
	album: albumRouter,
	artist: artistRouter,
	radio: radioRouter,
	playlist: playlistRouter,
	library: libraryRouter,
	search: searchRouter,
	player: playerRouter,
	queue: queueRouter,
	log: logRouter,
});

/**
 * Type definition for the combined application router.
 * Used by tRPC clients to infer procedure input/output types.
 */
export type AppRouter = typeof appRouter;
