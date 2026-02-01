import {
	createRouter,
	createRootRoute,
	createRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./components/layout/RootLayout";
import { LoginPage } from "./routes/login";
import { HomePage } from "./routes/home";
import { StationsPage } from "./routes/index";
import { SearchPage } from "./routes/search";
import { BookmarksPage } from "./routes/bookmarks";
import { GenresPage } from "./routes/genres";
import { SettingsPage } from "./routes/settings";
import { NowPlayingPage } from "./routes/now-playing";
import { StationDetailsPage } from "./routes/station-details";

const rootRoute = createRootRoute({
	component: RootLayout,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/login",
	component: LoginPage,
});

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: HomePage,
});

const stationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/stations",
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

const stationDetailsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/station/$token",
	component: function StationDetailsWrapper() {
		const { token } = stationDetailsRoute.useParams();
		return <StationDetailsPage stationToken={token} />;
	},
});

const routeTree = rootRoute.addChildren([
	loginRoute,
	homeRoute,
	stationsRoute,
	searchRoute,
	bookmarksRoute,
	genresRoute,
	settingsRoute,
	nowPlayingRoute,
	stationDetailsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Register {
		router: typeof router;
	}
}
