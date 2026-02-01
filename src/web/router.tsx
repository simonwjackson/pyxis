import {
	createRouter,
	createRootRoute,
	createRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./components/layout/RootLayout";
import { LoginPage } from "./routes/login";
import { StationsPage } from "./routes/index";
import { SearchPage } from "./routes/search";
import { BookmarksPage } from "./routes/bookmarks";
import { GenresPage } from "./routes/genres";
import { SettingsPage } from "./routes/settings";
import { NowPlayingPage } from "./routes/now-playing";

const rootRoute = createRootRoute({
	component: RootLayout,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/login",
	component: LoginPage,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: StationsPage,
});

const searchRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/search",
	component: SearchPage,
});

const bookmarksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/bookmarks",
	component: BookmarksPage,
});

const genresRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/genres",
	component: GenresPage,
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsPage,
});

const nowPlayingRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/now-playing",
	component: NowPlayingPage,
});

const routeTree = rootRoute.addChildren([
	loginRoute,
	indexRoute,
	searchRoute,
	bookmarksRoute,
	genresRoute,
	settingsRoute,
	nowPlayingRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Register {
		router: typeof router;
	}
}
