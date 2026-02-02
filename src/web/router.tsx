import {
	createRouter,
	createRootRoute,
	createRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./components/layout/RootLayout";

import { HomePage } from "./routes/home";
import { StationsPage } from "./routes/index";
import { SearchPage } from "./routes/search";
import { BookmarksPage } from "./routes/bookmarks";
import { GenresPage } from "./routes/genres";
import { SettingsPage } from "./routes/settings";
import { NowPlayingPage } from "./routes/now-playing";
import { StationDetailsPage } from "./routes/station-details";
import { AlbumDetailPage } from "./routes/album";
import { PlaylistDetailPage } from "./routes/playlist-detail";

const rootRoute = createRootRoute({
	component: RootLayout,
});

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: HomePage,
	validateSearch: (search: Record<string, unknown>) => ({
		pl_sort: typeof search["pl_sort"] === "string" ? search["pl_sort"] : undefined,
		pl_page: typeof search["pl_page"] === "string" ? Number(search["pl_page"]) : undefined,
		al_sort: typeof search["al_sort"] === "string" ? search["al_sort"] : undefined,
		al_page: typeof search["al_page"] === "string" ? Number(search["al_page"]) : undefined,
	}),
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

const albumDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/album/$albumId",
	component: function AlbumDetailWrapper() {
		const { albumId } = albumDetailRoute.useParams();
		return <AlbumDetailPage albumId={albumId} />;
	},
});

const playlistDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/playlist/$playlistId",
	component: function PlaylistDetailWrapper() {
		const { playlistId } = playlistDetailRoute.useParams();
		return <PlaylistDetailPage playlistId={playlistId} />;
	},
});

const routeTree = rootRoute.addChildren([
	homeRoute,
	stationsRoute,
	searchRoute,
	bookmarksRoute,
	genresRoute,
	settingsRoute,
	nowPlayingRoute,
	stationDetailsRoute,
	albumDetailRoute,
	playlistDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Register {
		router: typeof router;
	}
}
