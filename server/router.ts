import { router } from "./trpc.js";
import { authRouter } from "./routers/auth.js";
import { stationsRouter } from "./routers/stations.js";
import { playbackRouter } from "./routers/playback.js";
import { searchRouter } from "./routers/search.js";
import { bookmarksRouter } from "./routers/bookmarks.js";
import { genresRouter } from "./routers/genres.js";
import { userRouter } from "./routers/user.js";

export const appRouter = router({
	auth: authRouter,
	stations: stationsRouter,
	playback: playbackRouter,
	search: searchRouter,
	bookmarks: bookmarksRouter,
	genres: genresRouter,
	user: userRouter,
});

export type AppRouter = typeof appRouter;
