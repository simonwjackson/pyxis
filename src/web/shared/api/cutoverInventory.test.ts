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

const webConsumerInventory: readonly WebConsumerInventoryEntry[] = [
  // Migrated to Effect atoms in U6 -- entries intentionally omitted.
  // src/web/main.tsx -> RegistryProvider + PlaybackProvider only; React
  //   Query/tRPC providers were deleted after all web consumers moved to
  //   PyxisRpcClient atoms.
  // src/web/shared/lib/trpc.ts -> deleted after the web runtime cutover.
  // Migrated to Effect atoms in U6 -- entries intentionally omitted.
  // src/web/shared/playback/use-playback.ts -> playerStateStreamAtom over
  //   player.state.stream plus player command/report mutation atoms from
  //   src/web/shared/playback/playerAtoms.ts. The hook still owns DOM Audio
  //   lifecycle and local optimistic playback state; the wire boundary no
  //   longer uses React Query or legacy subscriptions.
  // Migrated to Effect atoms in U6 -- entries intentionally omitted.
  // src/web/shared/layout/now-playing-bar.tsx ->
  //   queueStateStreamAtom over queue.state.stream + NowPlayingBarState for
  //   the latest queue context/index, plus shared track command atoms for
  //   feedback/sleep/bookmark toasts.
  // Migrated to Effect atoms in U6 -- entries intentionally omitted.
  // src/web/shared/layout/command-palette.tsx ->
  //   trackFeedbackAddMutationAtom + trackSleepSetMutationAtom +
  //   libraryBookmarkAddMutationAtom (from
  //   src/web/shared/commands/trackCommandAtoms.ts), invoked via
  //   useAtomSet({ mode: "promiseExit" }) so the palette still toasts on
  //   success without touching React Query. The three commands do not
  //   publish reactivity tags because the legacy tRPC consumers did not
  //   invalidate any caches either.
  // src/web/shared/keyboard-shortcuts.ts ->
  //   same shared track command atoms as the command palette
  //   (trackCommandAtoms.ts), invoked via useAtomSet({ mode: "promiseExit" })
  //   so the global keyboard shortcuts emit the same success/failure
  //   toasts as before without going through React Query.
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
  // Migrated to Effect atoms in U6 -- entry intentionally omitted.
  // src/web/features/search/search-page.tsx -> search.unified query atom +
  //   library.albumStates.resolve query atom (subscribed to
  //   LIBRARY_ALBUM_STATES_TAG) + SearchState ADT. Mutations:
  //   radio.station.create publishes RADIO_STATIONS_TAG (mirrors
  //   utils.radio.list.invalidate); library.album.save publishes
  //   LIBRARY_ALBUMS_TAG + LIBRARY_HOT_ALBUMS_TAG + LIBRARY_ALBUM_STATES_TAG
  //   (mirrors utils.library.albums/hotAlbums/resolveAlbumStates invalidations);
  //   playlist.radio.create publishes PLAYLIST_LIST_TAG (mirrors
  //   utils.playlist.list.invalidate). The play-album action uses
  //   album.withTracks.get as an imperative mutation-atom fetch, matching
  //   the station-detail "fetch then play" pattern.
  // Migrated to Effect atoms in U6 -- entries intentionally omitted.
  // src/web/features/album-detail/library-album-detail-root.tsx ->
  //   library.album.get + library.albumTracks.list query atoms combined
  //   through LibraryAlbumDetailState (album.get subscribes to
  //   libraryAlbumTag(id); albumTracks.list subscribes to
  //   libraryAlbumTracksTag(albumId)). Mutations:
  //   library.album.save and library.albumPlacement.set publish
  //   LIBRARY_ALBUMS_TAG + LIBRARY_HOT_ALBUMS_TAG +
  //   LIBRARY_ALBUM_STATES_TAG + libraryAlbumTag(id) (mirrors the
  //   utils.library.albums + hotAlbums + resolveAlbumStates + album
  //   invalidation quadruple); library.album.update publishes
  //   LIBRARY_ALBUMS_TAG + libraryAlbumTag(id); library.track.update
  //   publishes libraryAlbumTracksTag(albumId).
  // src/web/features/album-detail/source-album-detail-root.tsx ->
  //   album.withTracks.get + library.albumStates.resolve query atoms
  //   combined through SourceAlbumDetailState (states subscribes to
  //   LIBRARY_ALBUM_STATES_TAG). Mutations:
  //   library.album.save and library.albumPlacement.set publish
  //   LIBRARY_ALBUMS_TAG + LIBRARY_HOT_ALBUMS_TAG +
  //   LIBRARY_ALBUM_STATES_TAG + (when the source maps to a library album)
  //   libraryAlbumTag(linkedId) so the parallel library detail surface
  //   refreshes the same way the legacy
  //   utils.library.album.invalidate() did.
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
