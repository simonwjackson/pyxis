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
import { credentialsRouter } from "./routers/credentials.js";

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
	credentials: credentialsRouter,
});

export type AppRouter = typeof appRouter;
