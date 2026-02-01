import { router } from "./trpc.js";
import { authRouter } from "./routers/auth.js";
import { stationsRouter } from "./routers/stations.js";
import { playbackRouter } from "./routers/playback.js";
import { searchRouter } from "./routers/search.js";
import { bookmarksRouter } from "./routers/bookmarks.js";
import { genresRouter } from "./routers/genres.js";
import { userRouter } from "./routers/user.js";
import { streamRouter } from "./routers/stream.js";
import { playlistsRouter } from "./routers/playlists.js";
import { collectionRouter } from "./routers/collection.js";

export const appRouter = router({
	auth: authRouter,
	stations: stationsRouter,
	playback: playbackRouter,
	search: searchRouter,
	bookmarks: bookmarksRouter,
	genres: genresRouter,
	user: userRouter,
	stream: streamRouter,
	playlists: playlistsRouter,
	collection: collectionRouter,
});

export type AppRouter = typeof appRouter;
