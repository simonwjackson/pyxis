import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type WebConsumerInventoryEntry = {
	readonly file: string;
	readonly runtimeUsages: readonly string[];
	readonly invalidationBehavior: readonly string[];
	readonly replacement: {
		readonly target: string;
		readonly note: string;
	};
};

function consumer(
	file: string,
	runtimeUsages: readonly string[],
	invalidationBehavior: readonly string[],
	target: string,
): WebConsumerInventoryEntry {
	return {
		file,
		runtimeUsages,
		invalidationBehavior,
		replacement: {
			target,
			note: "Replace this legacy tRPC/React Query consumer with Effect RPC client layer, Effect atoms, and a feature ADT during U6.",
		},
	};
}

const albumInvalidations = [
	"library.albums",
	"library.hotAlbums",
	"library.resolveAlbumStates",
	"affected library.album and library.albumTracks queries",
] as const;

const webConsumerInventory: readonly WebConsumerInventoryEntry[] = [
	consumer(
		"src/web/main.tsx",
		[
			"trpc:import",
			"react-query:import",
			"react-query:provider",
			"trpc:provider",
			"trpc:create-client",
		],
		["Owns global React Query client defaults and tRPC provider state"],
		"src/web/shared/effect/runtime.ts + src/web/shared/api/rpcClient.ts",
	),
	consumer(
		"src/web/shared/lib/trpc.ts",
		["manual:/trpc", "trpc:provider", "trpc:create-client"],
		[
			"Defines /trpc batch and subscription transports; delete after Effect RPC client cutover",
		],
		"src/web/shared/api/rpcClient.ts",
	),
	consumer(
		"src/web/shared/playback/use-playback.ts",
		[
			"trpc:import",
			"trpc.player.reportProgress.useMutation",
			"trpc.player.reportDuration.useMutation",
			"trpc.player.reportAudioError.useMutation",
			"trpc.player.trackEnded.useMutation",
			"trpc.log.client.useMutation",
			"trpc.player.pause.useMutation",
			"trpc.player.resume.useMutation",
			"trpc.player.seek.useMutation",
			"trpc.player.skip.useMutation",
			"trpc.player.previous.useMutation",
			"trpc.player.stop.useMutation",
			"trpc.player.play.useMutation",
			"trpc.player.jumpTo.useMutation",
			"manual:/trpc",
		],
		[
			"Manual EventSource(/trpc/player.onStateChange) is the playback realtime source; reportProgress is intentionally silent",
		],
		"src/web/shared/playback/PlaybackState atoms over player.state.stream and player commands",
	),
	consumer(
		"src/web/shared/layout/now-playing-bar.tsx",
		[
			"trpc:import",
			"trpc.queue.onChange.useSubscription",
			"trpc.track.feedback.useMutation",
			"trpc.track.sleep.useMutation",
			"trpc.library.addBookmark.useMutation",
		],
		[
			"Queue subscription updates local queue context; feedback/sleep/bookmark only toast today",
		],
		"NowPlayingBarState atom and command atoms",
	),
	consumer(
		"src/web/shared/layout/command-palette.tsx",
		[
			"trpc:import",
			"trpc.track.feedback.useMutation",
			"trpc.track.sleep.useMutation",
			"trpc.library.addBookmark.useMutation",
		],
		["Command side effects currently do not invalidate React Query caches"],
		"CommandPaletteState command atoms",
	),
	consumer(
		"src/web/shared/keyboard-shortcuts.ts",
		[
			"trpc:import",
			"trpc.track.feedback.useMutation",
			"trpc.track.sleep.useMutation",
			"trpc.library.addBookmark.useMutation",
		],
		[
			"Keyboard command side effects currently do not invalidate React Query caches",
		],
		"Playback command atoms shared by keyboard shortcuts",
	),
	// Migrated to Effect atoms in U6 -- entries intentionally omitted.
	// src/web/shared/layout/sidebar.tsx -> authStatusQueryAtom + AuthStatusState
	// src/web/shared/layout/mobile-nav.tsx -> authStatusQueryAtom + AuthStatusState
	// src/web/shared/track-info-modal/TrackInfoTraits.tsx -> TrackInfoState
	// Migrated to Effect atoms in U6 -- entry intentionally omitted.
	// src/web/features/home/home-page.tsx -> playlist/hot/discovery/collection/
	//   archive query atoms + HomeState (each shelf is its own sub-component;
	//   the archive sub-component only mounts when the user expands it,
	//   preserving the legacy `enabled: showArchive` semantics). Shelf atoms
	//   subscribe to library.albums / library.hotAlbums / playlist.list
	//   reactivity tags so save/place/remove/update/createRadio mutations on
	//   other surfaces refresh the page the same way the legacy
	//   utils.library.albums / utils.library.hotAlbums / utils.playlist.list
	//   invalidations did.

	consumer(
		"src/web/features/search/search-page.tsx",
		[
			"trpc:import",
			"trpc.search.unified.useQuery",
			"trpc.library.resolveAlbumStates.useQuery",
			"trpc.radio.create.useMutation",
			"trpc.library.saveAlbum.useMutation",
			"trpc.playlist.createRadio.useMutation",
			"trpc.useUtils",
		],
		[
			"radio.create -> radio.list; library.saveAlbum -> library albums/hot/states; playlist.createRadio -> playlist.list",
		],
		"SearchState atoms and command refresh tags",
	),
	consumer(
		"src/web/features/album-detail/library-album-detail-root.tsx",
		[
			"trpc:import",
			"trpc.library.album.useQuery",
			"trpc.library.albumTracks.useQuery",
			"trpc.library.saveAlbum.useMutation",
			"trpc.library.setPlacement.useMutation",
			"trpc.library.updateAlbum.useMutation",
			"trpc.library.updateTrack.useMutation",
			"trpc.useUtils",
		],
		albumInvalidations,
		"LibraryAlbumDetailState atoms and command refresh tags",
	),
	consumer(
		"src/web/features/album-detail/source-album-detail-root.tsx",
		[
			"trpc:import",
			"trpc.album.getWithTracks.useQuery",
			"trpc.library.resolveAlbumStates.useQuery",
			"trpc.library.saveAlbum.useMutation",
			"trpc.library.setPlacement.useMutation",
			"trpc.useUtils",
		],
		albumInvalidations,
		"SourceAlbumDetailState atoms and command refresh tags",
	),
	// Migrated to Effect atoms in U6 -- entries intentionally omitted.
	// src/web/features/station-detail/station-detail-page.tsx ->
	//   stationQueryAtom (radio.station.get, subscribes to radio.station:<id>
	//   reactivity tag) + StationDetailState; radio.seed.remove mutation atom
	//   publishes the same tag so add/remove seed mutations refresh the page;
	//   radio.stationTracks.get is an imperative mutation-atom fetch that
	//   drives playback.playQueue; queue.state.stream feeds the queue context
	//   atom that decides whether the header Play button is hidden.
	// src/web/features/stations/stations-page.tsx ->
	//   stationsQueryAtom + StationsState (refreshed via radio.stations tag)
	// src/web/features/stations/delete-station-dialog.tsx ->
	//   radio.station.delete mutation atom + StationCommandState
	//   (publishes radio.stations reactivity tag)
	// src/web/features/stations/rename-station-dialog.tsx ->
	//   radio.station.rename mutation atom + StationCommandState
	//   (publishes radio.stations reactivity tag)
	// src/web/features/stations/quick-mix-dialog.tsx ->
	//   radio.quickMix.set mutation atom + StationCommandState
	//   (publishes radio.stations reactivity tag)
	// src/web/features/stations/add-seed-dialog.tsx ->
	//   search.pandora query atom + radio.seed.add mutation atom +
	//   AddSeedDialogState (publishes radio.station:<radioId> reactivity tag
	//   for the next U6 slice's station-detail atom).
	// Migrated to Effect atoms in U6 -- entries intentionally omitted.
	// src/web/features/genres/genres-page.tsx -> radio.genres.list query atom +
	//   radio.station.create mutation atom + GenresState (publishes
	//   RADIO_STATIONS_TAG so the stations surface refreshes after a station
	//   is created, mirroring the legacy utils.radio.list invalidation).
	// src/web/features/bookmarks/bookmarks-page.tsx ->
	//   library.bookmarks.list query atom (subscribed to LIBRARY_BOOKMARKS_TAG)
	//   + library.bookmark.remove mutation atom (publishes the same tag,
	//   mirroring utils.library.bookmarks.invalidate) + radio.station.create
	//   mutation atom (publishes RADIO_STATIONS_TAG, mirroring
	//   utils.radio.list.invalidate) + BookmarksState ADT.
	// Migrated to Effect atoms in U6 -- entries intentionally omitted.
	// src/web/features/history/history-page.tsx -> HistoryState atom
	// src/web/features/settings/settings-page.tsx -> SettingsState +
	//   auth.settings reactivity tag (replaces React Query invalidation).
	// src/web/features/playlist-detail/playlist-detail-page.tsx ->
	//   playlist.list + playlist.tracks.list query atoms combined through
	//   PlaylistDetailState; playlist list subscribes to PLAYLIST_LIST_TAG.
	// src/web/features/sandbox/queue-coverflow/QueueCoverflowPage.tsx ->
	//   fixture-only QueueCoverflowState harness; live library query removed.
];

function files(dir: string): readonly string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return files(path);
		if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return [];
		if (path.endsWith("cutoverInventory.test.ts")) return [];
		return [path];
	});
}

function unique(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort();
}

function scanRuntimeUsages(source: string): readonly string[] {
	const usages: string[] = [];
	if (/from ["'].*shared\/lib\/trpc|from ["']\.\.?\/.*lib\/trpc/.test(source))
		usages.push("trpc:import");
	for (const match of source.matchAll(
		/trpc\.([A-Za-z]\w*)\.([A-Za-z]\w*)\.use(Query|Mutation|Subscription)/g,
	)) {
		const [routerName, procedureName, hookType] = [
			match[1],
			match[2],
			match[3],
		];
		if (routerName && procedureName && hookType)
			usages.push(`trpc.${routerName}.${procedureName}.use${hookType}`);
	}
	if (source.includes("trpc.useUtils()")) usages.push("trpc.useUtils");
	if (/["']\/trpc/.test(source)) usages.push("manual:/trpc");
	if (source.includes("@tanstack/react-query"))
		usages.push("react-query:import");
	if (source.includes("QueryClientProvider"))
		usages.push("react-query:provider");
	if (source.includes("<trpc.Provider")) usages.push("trpc:provider");
	if (source.includes("createTRPCClient")) usages.push("trpc:create-client");
	return unique(usages);
}

function scannedConsumers(): ReadonlyMap<string, readonly string[]> {
	return new Map(
		files("src/web")
			.map(
				(file) =>
					[file, scanRuntimeUsages(readFileSync(file, "utf8"))] as const,
			)
			.filter(([, usages]) => usages.length > 0),
	);
}

describe("web runtime cutover inventory", () => {
	it("maps every tRPC, React Query, manual /trpc, and invalidation consumer", () => {
		const actual = scannedConsumers();
		const expected = new Map(
			webConsumerInventory.map(
				(entry) => [entry.file, unique(entry.runtimeUsages)] as const,
			),
		);

		expect([...expected.keys()].sort()).toEqual([...actual.keys()].sort());
		for (const [file, usages] of actual) {
			expect(expected.get(file)).toEqual(usages);
		}
	});

	it("records invalidation behavior and Effect replacement seams for each consumer", () => {
		const incomplete = webConsumerInventory.filter(
			(entry) =>
				entry.invalidationBehavior.length === 0 ||
				entry.replacement.target.length === 0 ||
				entry.replacement.note.length === 0,
		);
		expect(incomplete).toEqual([]);
	});
});
