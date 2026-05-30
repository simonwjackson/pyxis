import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { canonicalizeRpcParityPair } from "./parity.test-support.js";

type ProcedureClassification = "read" | "command" | "stream";
type ReplacementStatus = "effect-rpc" | "effect-stream" | "explicit-removal";

type CutoverEndpoint = {
  readonly procedure: string;
  readonly routerFile: string;
  readonly classification: ProcedureClassification;
  readonly inputShape: string;
  readonly successShape: string;
  readonly errorBehavior: string;
  readonly consumerSurfaces: readonly string[];
  readonly invalidationBehavior: string;
  readonly replacement: {
    readonly status: ReplacementStatus;
    readonly target: string;
    readonly note: string;
  };
};

function endpoint(
  procedure: string,
  classification: ProcedureClassification,
  inputShape: string,
  successShape: string,
  errorBehavior: string,
  consumerSurfaces: readonly string[],
  invalidationBehavior: string,
  target: string,
  replacementStatus: ReplacementStatus = "effect-rpc",
): CutoverEndpoint {
  const [routerName] = procedure.split(".");
  if (!routerName)
    throw new Error(`Invalid procedure inventory entry: ${procedure}`);
  return {
    procedure,
    routerFile: `server/routers/${routerName}.ts`,
    classification,
    inputShape,
    successShape,
    errorBehavior,
    consumerSurfaces,
    invalidationBehavior,
    replacement: {
      status: replacementStatus,
      target,
      note: "Mapped for the Effect runtime big-bang cutover; old tRPC remains only until the cutover unit deletes it.",
    },
  };
}

const sharedAlbumInvalidation =
  "Refresh library.albums, library.hotAlbums, library.resolveAlbumStates, and affected library.album detail atoms.";

const cutoverEndpointInventory: readonly CutoverEndpoint[] = [
  endpoint(
    "auth.status",
    "read",
    "none",
    "{ authenticated, hasPandora }",
    "never requires Pandora; reports missing Pandora as hasPandora=false",
    [
      "src/web/features/settings/settings-page.tsx",
      "src/web/shared/layout/sidebar.tsx",
      "src/web/shared/layout/mobile-nav.tsx",
    ],
    "Read-only auth status cache",
    "auth.status.get",
  ),
  endpoint(
    "auth.settings",
    "read",
    "none",
    "Pandora user settings",
    "Pandora credentials/session errors surface through protected procedure",
    ["src/web/features/settings/settings-page.tsx"],
    "Invalidated by auth.setExplicitFilter",
    "auth.settings.get",
  ),
  endpoint(
    "auth.usage",
    "read",
    "none",
    "Pandora usage info",
    "Pandora credentials/session errors surface through protected procedure",
    ["src/web/features/settings/settings-page.tsx"],
    "Read-only usage cache",
    "auth.usage.get",
  ),
  endpoint(
    "auth.changeSettings",
    "command",
    "partial Pandora settings",
    "{ success: true }",
    "Zod validation and Pandora protected-procedure errors",
    ["No current web consumer; preserve API behavior until removal decision"],
    "Should refresh auth.settings if retained",
    "auth.settings.change",
  ),
  endpoint(
    "auth.setExplicitFilter",
    "command",
    "{ enabled: boolean }",
    "{ success: true }",
    "Zod validation and Pandora protected-procedure errors",
    ["src/web/features/settings/settings-page.tsx"],
    "Invalidates auth.settings",
    "auth.explicitFilter.set",
  ),

  endpoint(
    "track.get",
    "read",
    "{ id }",
    "{ id, capabilities }",
    "Invalid or unknown source resolves through track source helper",
    ["No current web consumer; preserve API behavior until removal decision"],
    "Read-only track metadata cache",
    "track.metadata.get",
  ),
  endpoint(
    "track.streamUrl",
    "read",
    "{ id, nextId? }",
    "{ url }",
    "Builds plain HTTP /stream URL; no audio bytes through RPC",
    ["No current web consumer; player state embeds streamUrl"],
    "Read-only stream URL cache",
    "track.streamUrl.get",
  ),
  endpoint(
    "track.feedback",
    "command",
    "{ id, radioId, positive }",
    "{ feedbackId, songName, artistName }",
    "Pandora protected-procedure errors",
    [
      "src/web/shared/keyboard-shortcuts.ts",
      "src/web/shared/layout/now-playing-bar.tsx",
      "src/web/shared/layout/command-palette.tsx",
    ],
    "No current React Query invalidation; command feedback is toast/local",
    "track.feedback.add",
  ),
  endpoint(
    "track.removeFeedback",
    "command",
    "{ feedbackId }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    [
      "No current web consumer; station detail feedback removal may need parity",
    ],
    "Should refresh radio.getStation when used",
    "track.feedback.remove",
  ),
  endpoint(
    "track.sleep",
    "command",
    "{ id }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    [
      "src/web/shared/keyboard-shortcuts.ts",
      "src/web/shared/layout/now-playing-bar.tsx",
      "src/web/shared/layout/command-palette.tsx",
    ],
    "No current React Query invalidation; command feedback is toast/local",
    "track.sleep.set",
  ),
  endpoint(
    "track.explain",
    "read",
    "{ id }",
    "Pandora explanation payload",
    "Pandora protected-procedure errors",
    ["src/web/shared/track-info-modal/TrackInfoTraits.tsx"],
    "Read-only track explanation cache",
    "track.explanation.get",
  ),

  endpoint(
    "album.get",
    "read",
    "{ id }",
    "source album metadata",
    "Requires source-prefixed id; source manager errors bubble",
    ["No current web consumer; getWithTracks is the active album surface"],
    "Read-only source album cache",
    "album.get",
  ),
  endpoint(
    "album.tracks",
    "read",
    "{ id }",
    "source album tracks",
    "Requires source-prefixed id; source manager errors bubble",
    ["No current web consumer; getWithTracks is the active album surface"],
    "Read-only source album tracks cache",
    "album.tracks.list",
  ),
  endpoint(
    "album.getWithTracks",
    "read",
    "{ id }",
    "{ album, tracks[] } with trackIndex and capabilities",
    "Requires source-prefixed id; source manager errors bubble",
    ["src/web/features/album-detail/source-album-detail-root.tsx"],
    "Read-only source album detail cache",
    "album.withTracks.get",
  ),

  endpoint(
    "artist.get",
    "read",
    "{ id }",
    "limited artist metadata derived from id",
    "Parse-only fallback to unknown source",
    ["No current web consumer; preserve until removal decision"],
    "Read-only artist cache",
    "artist.get",
  ),
  endpoint(
    "artist.search",
    "read",
    "{ query }",
    "{ artists[] } derived from track search",
    "Source manager errors bubble",
    ["No current web consumer; preserve until removal decision"],
    "Read-only artist search cache",
    "artist.search",
  ),

  endpoint(
    "radio.list",
    "read",
    "none",
    "Pandora station summaries",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/stations-page.tsx"],
    "Invalidated by station create/delete/rename/quickMix",
    "radio.stations.list",
  ),
  endpoint(
    "radio.getStation",
    "read",
    "{ id }",
    "Pandora station detail, seeds, feedback",
    "Pandora protected-procedure errors",
    ["src/web/features/station-detail/station-detail-page.tsx"],
    "Invalidated by radio.addSeed and radio.removeSeed",
    "radio.station.get",
  ),
  endpoint(
    "radio.getTracks",
    "read",
    "{ id, quality? }",
    "next Pandora radio tracks",
    "Pandora protected-procedure errors; drops malformed playlist items",
    ["src/web/features/station-detail/station-detail-page.tsx"],
    "Manually refetched for radio playback start",
    "radio.stationTracks.get",
  ),
  endpoint(
    "radio.create",
    "command",
    "seed/music/track token payload",
    "Pandora createStation response",
    "Pandora protected-procedure errors",
    [
      "src/web/features/search/search-page.tsx",
      "src/web/features/genres/genres-page.tsx",
      "src/web/features/bookmarks/bookmarks-page.tsx",
    ],
    "Invalidates radio.list",
    "radio.station.create",
  ),
  endpoint(
    "radio.delete",
    "command",
    "{ id }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/delete-station-dialog.tsx"],
    "Invalidates radio.list",
    "radio.station.delete",
  ),
  endpoint(
    "radio.rename",
    "command",
    "{ id, name }",
    "Pandora rename response",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/rename-station-dialog.tsx"],
    "Invalidates radio.list",
    "radio.station.rename",
  ),
  endpoint(
    "radio.genres",
    "read",
    "none",
    "Pandora genre station categories",
    "Pandora protected-procedure errors",
    ["src/web/features/genres/genres-page.tsx"],
    "Read-only genre cache",
    "radio.genres.list",
  ),
  endpoint(
    "radio.quickMix",
    "command",
    "{ radioIds[] }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/quick-mix-dialog.tsx"],
    "Invalidates radio.list",
    "radio.quickMix.set",
  ),
  endpoint(
    "radio.addSeed",
    "command",
    "{ radioId, musicToken }",
    "Pandora addMusic response",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/add-seed-dialog.tsx"],
    "Invalidates radio.getStation({ id })",
    "radio.seed.add",
  ),
  endpoint(
    "radio.removeSeed",
    "command",
    "{ radioId, seedId }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    ["src/web/features/station-detail/station-detail-page.tsx"],
    "Invalidates radio.getStation({ id })",
    "radio.seed.remove",
  ),

  endpoint(
    "playlist.list",
    "read",
    "none",
    "all source playlists",
    "Source manager errors bubble",
    [
      "src/web/features/home/home-page.tsx",
      "src/web/features/playlist-detail/playlist-detail-page.tsx",
    ],
    "Invalidated by playlist.createRadio",
    "playlist.list",
  ),
  endpoint(
    "playlist.getTracks",
    "read",
    "{ id }",
    "playlist tracks",
    "Requires source-prefixed id; source manager errors bubble",
    ["src/web/features/playlist-detail/playlist-detail-page.tsx"],
    "Read-only playlist tracks cache",
    "playlist.tracks.list",
  ),
  endpoint(
    "playlist.createRadio",
    "command",
    "{ trackId, name, artworkUrl? }",
    "{ id, url }",
    "Persistence errors bubble; source manager invalidated after upsert",
    ["src/web/features/search/search-page.tsx"],
    "Invalidates playlist.list",
    "playlist.radio.create",
  ),

  endpoint(
    "library.albums",
    "read",
    "placement filters",
    "library album summaries",
    "Persistence errors bubble",
    [
      "src/web/features/home/home-page.tsx",
      "src/web/features/sandbox/queue-coverflow/QueueCoverflowPage.tsx",
    ],
    "Invalidated by library save/place/update/remove flows",
    "library.albums.list",
  ),
  endpoint(
    "library.album",
    "read",
    "{ id }",
    "library album detail or null",
    "Persistence errors bubble",
    ["src/web/features/album-detail/library-album-detail-root.tsx"],
    "Invalidated by library save/place/updateAlbum",
    "library.album.get",
  ),
  endpoint(
    "library.hotAlbums",
    "read",
    "{ includeDismissed?, limit? }",
    "hot album summaries",
    "Persistence errors bubble",
    ["src/web/features/home/home-page.tsx"],
    "Invalidated by save/place/listen-log affected flows",
    "library.hotAlbums.list",
  ),
  endpoint(
    "library.resolveAlbumStates",
    "read",
    "{ sourceIds[] }",
    "library placement/hot state per source id",
    "Persistence errors bubble",
    [
      "src/web/features/search/search-page.tsx",
      "src/web/features/album-detail/source-album-detail-root.tsx",
    ],
    "Invalidated by save/place/listen-log affected flows",
    "library.albumStates.resolve",
  ),
  endpoint(
    "library.albumTracks",
    "read",
    "{ albumId }",
    "library album track list with capabilities",
    "Persistence errors bubble",
    ["src/web/features/album-detail/library-album-detail-root.tsx"],
    "Invalidated by library.updateTrack",
    "library.albumTracks.list",
  ),
  endpoint(
    "library.saveAlbum",
    "command",
    "{ id }",
    "save outcome with album id and placement",
    "Requires source-prefixed id; source manager/persistence errors bubble",
    [
      "src/web/features/search/search-page.tsx",
      "src/web/features/album-detail/library-album-detail-root.tsx",
      "src/web/features/album-detail/source-album-detail-root.tsx",
    ],
    sharedAlbumInvalidation,
    "library.album.save",
  ),
  endpoint(
    "library.setPlacement",
    "command",
    "{ albumId, placement }",
    "updated library album",
    "Placement schema and persistence errors",
    [
      "src/web/features/album-detail/library-album-detail-root.tsx",
      "src/web/features/album-detail/source-album-detail-root.tsx",
    ],
    sharedAlbumInvalidation,
    "library.albumPlacement.set",
  ),
  endpoint(
    "library.removeAlbum",
    "command",
    "{ id }",
    "{ success: true }",
    "Persistence errors bubble",
    ["No current web consumer; preserve until removal decision"],
    sharedAlbumInvalidation,
    "library.album.remove",
  ),
  endpoint(
    "library.updateAlbum",
    "command",
    "{ id, title?, artist? }",
    "{ success: true }",
    "Requires at least one non-empty field",
    ["src/web/features/album-detail/library-album-detail-root.tsx"],
    "Invalidates library.album and library.albums",
    "library.album.update",
  ),
  endpoint(
    "library.updateTrack",
    "command",
    "{ id, title }",
    "{ success: true }",
    "Requires non-empty title",
    ["src/web/features/album-detail/library-album-detail-root.tsx"],
    "Invalidates library.albumTracks({ albumId })",
    "library.track.update",
  ),
  endpoint(
    "library.bookmarks",
    "read",
    "none",
    "Pandora bookmarks",
    "Pandora protected-procedure errors",
    ["src/web/features/bookmarks/bookmarks-page.tsx"],
    "Invalidated by library.removeBookmark; addBookmark has no current read invalidation",
    "library.bookmarks.list",
  ),
  endpoint(
    "library.addBookmark",
    "command",
    "{ id, type }",
    "Pandora bookmark response",
    "Pandora protected-procedure errors",
    [
      "src/web/shared/keyboard-shortcuts.ts",
      "src/web/shared/layout/now-playing-bar.tsx",
      "src/web/shared/layout/command-palette.tsx",
    ],
    "No current React Query invalidation",
    "library.bookmark.add",
  ),
  endpoint(
    "library.removeBookmark",
    "command",
    "{ bookmarkToken, type }",
    "{ success: true }",
    "Pandora protected-procedure errors",
    ["src/web/features/bookmarks/bookmarks-page.tsx"],
    "Invalidates library.bookmarks",
    "library.bookmark.remove",
  ),

  endpoint(
    "search.search",
    "read",
    "{ searchText }",
    "raw Pandora search results",
    "Pandora protected-procedure errors",
    ["src/web/features/stations/add-seed-dialog.tsx"],
    "Read-only debounced search cache",
    "search.pandora",
  ),
  endpoint(
    "search.unified",
    "read",
    "{ query }",
    "tracks, albums, pandora artists, pandora genres",
    "Source manager errors bubble; optional Pandora errors bubble when session exists",
    ["src/web/features/search/search-page.tsx"],
    "Read-only search cache",
    "search.unified",
  ),

  endpoint(
    "player.state",
    "read",
    "none",
    "serialized player state with streamUrl",
    "No current error path",
    ["No current web hook; subscription is active state source"],
    "Read-only snapshot cache",
    "player.state.get",
  ),
  endpoint(
    "player.play",
    "command",
    "optional tracks/context/startIndex",
    "serialized player state",
    "Track source resolution errors for supplied tracks",
    [
      "src/web/shared/playback/use-playback.ts",
      "album/search/station playback actions through context",
    ],
    "Emits player state and queue changes",
    "player.play",
  ),
  endpoint(
    "player.pause",
    "command",
    "none",
    "serialized player state",
    "No-op unless playing",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player state when status changes",
    "player.pause",
  ),
  endpoint(
    "player.resume",
    "command",
    "none",
    "serialized player state",
    "No-op unless paused",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player state when status changes",
    "player.resume",
  ),
  endpoint(
    "player.stop",
    "command",
    "none",
    "serialized player state",
    "Always clears queue and stops",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player and queue state",
    "player.stop",
  ),
  endpoint(
    "player.skip",
    "command",
    "none",
    "serialized player state",
    "Stops at end of queue",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player and queue state; may trigger listen-log",
    "player.skip",
  ),
  endpoint(
    "player.previous",
    "command",
    "none",
    "serialized player state",
    "No-op at queue start",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player/queue only when previous track exists",
    "player.previous",
  ),
  endpoint(
    "player.jumpTo",
    "command",
    "{ index }",
    "serialized player state",
    "Invalid index is no-op",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player/queue only when index exists",
    "player.jumpTo",
  ),
  endpoint(
    "player.seek",
    "command",
    "{ position }",
    "serialized player state",
    "Service clamps position to [0,duration]",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player state",
    "player.seek",
  ),
  endpoint(
    "player.volume",
    "command",
    "{ level }",
    "serialized player state",
    "Zod rejects outside 0-100",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player state",
    "player.volume.set",
  ),
  endpoint(
    "player.reportProgress",
    "command",
    "{ progress }",
    "{ ok: true }",
    "Progress is accepted silently",
    ["src/web/shared/playback/use-playback.ts"],
    "Silent server sync; no subscriber invalidation",
    "player.progress.report",
  ),
  endpoint(
    "player.reportDuration",
    "command",
    "{ duration }",
    "{ ok: true }",
    "Duration is accepted and marks audio observed",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player state",
    "player.duration.report",
  ),
  endpoint(
    "player.reportAudioError",
    "command",
    "{ message }",
    "{ ok: true }",
    "Message truncated by schema/service",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player error realization state",
    "player.audioError.report",
  ),
  endpoint(
    "player.trackEnded",
    "command",
    "none",
    "serialized player state",
    "Advances or stops at queue end",
    ["src/web/shared/playback/use-playback.ts"],
    "Emits player/queue and may trigger listen-log",
    "player.trackEnded",
  ),
  endpoint(
    "player.onStateChange",
    "stream",
    "none",
    "snapshot-first player stream",
    "Effect stream scope cleanup releases listener",
    ["src/web/shared/playback/use-playback.ts playerStateStreamAtom"],
    "Realtime state source",
    "player.state.stream",
    "effect-stream",
  ),

  endpoint(
    "queue.get",
    "read",
    "none",
    "serialized queue state",
    "No current error path",
    ["No current web hook; subscription is active state source"],
    "Read-only queue snapshot cache",
    "queue.state.get",
  ),
  endpoint(
    "queue.add",
    "command",
    "{ tracks[], insertNext? }",
    "serialized queue state",
    "Track source resolution errors for supplied tracks",
    ["No direct current web hook; playback context owns queue writes"],
    "Emits queue state",
    "queue.tracks.add",
  ),
  endpoint(
    "queue.remove",
    "command",
    "{ index }",
    "serialized queue state",
    "Invalid index is no-op",
    ["No current web consumer; preserve until removal decision"],
    "Emits only for valid removals",
    "queue.track.remove",
  ),
  endpoint(
    "queue.clear",
    "command",
    "none",
    "serialized queue state",
    "Always clears",
    ["No current web consumer; player.stop is active clear path"],
    "Emits queue state",
    "queue.clear",
  ),
  endpoint(
    "queue.jump",
    "command",
    "{ index }",
    "serialized queue state",
    "Invalid index is no-op",
    ["No current web consumer; player.jumpTo is active path"],
    "Emits only for valid jumps",
    "queue.jump",
  ),
  endpoint(
    "queue.shuffle",
    "command",
    "none",
    "serialized queue state",
    "No-op for empty/singleton queue",
    ["No current web consumer; preserve until removal decision"],
    "Emits queue state when shuffled",
    "queue.shuffle",
  ),
  endpoint(
    "queue.onChange",
    "stream",
    "none",
    "snapshot-first queue SSE",
    "Subscription cleanup removes listener",
    [
      "src/web/shared/layout/now-playing-bar.tsx",
      "src/web/features/station-detail/station-detail-page.tsx",
    ],
    "Realtime queue source",
    "queue.state.stream",
    "effect-stream",
  ),

  endpoint(
    "log.client",
    "command",
    "{ message }",
    "{ ok: true }",
    "String validation only; logs server-side",
    ["src/web/shared/playback/use-playback.ts"],
    "Fire-and-forget client diagnostics",
    "log.client.write",
  ),
  endpoint(
    "listenLog.list",
    "read",
    "{ limit, offset }",
    "listen-log entries newest first",
    "Pagination schema errors; persistence errors bubble",
    ["src/web/features/history/history-page.tsx"],
    "Invalidated by server-side player listen-log side effects",
    "listenLog.entries.list",
  ),
];

describe("tRPC cutover endpoint inventory", () => {
  it("retains the legacy procedure inventory as a completed cutover artifact", () => {
    expect(cutoverEndpointInventory.length).toBeGreaterThan(0);
    expect(
      cutoverEndpointInventory.every(
        (entry) => entry.replacement.status !== "explicit-removal",
      ),
    ).toBe(true);
  });

  it("removes the legacy router implementation files after the cutover", () => {
    expect(existsSync("server/routers")).toBe(false);
    expect(existsSync("server/router.ts")).toBe(false);
    expect(existsSync("server/trpc.ts")).toBe(false);
  });

  it("records behavior, consumers, invalidation, and replacement status for each procedure", () => {
    const incomplete = cutoverEndpointInventory.filter(
      (entry) =>
        entry.inputShape.length === 0 ||
        entry.successShape.length === 0 ||
        entry.errorBehavior.length === 0 ||
        entry.consumerSurfaces.length === 0 ||
        entry.invalidationBehavior.length === 0 ||
        entry.replacement.target.length === 0 ||
        entry.replacement.note.length === 0,
    );
    expect(incomplete).toEqual([]);
  });
});

describe("branch-internal RPC parity canonicalization", () => {
  it("normalizes library, search, playback, and queue payloads without dropping product fields", () => {
    const legacy = {
      library: {
        title: "Album",
        sourceIds: ["ytmusic:a"],
        placement: "discovery",
        undefinedField: undefined,
      },
      search: {
        albums: [{ id: "ytmusic:a", title: "Album", artist: "Artist" }],
        tracks: [],
      },
      playback: {
        updatedAt: 100,
        status: "playing",
        currentTrack: {
          id: "ytmusic:t",
          streamUrl: "/stream/ytmusic:t?next=ytmusic:u",
        },
      },
      queue: {
        context: { type: "album", albumId: "ytmusic:a" },
        currentIndex: 0,
        items: [{ id: "ytmusic:t", title: "Track" }],
      },
    };
    const effect = {
      queue: {
        items: [{ title: "Track", id: "ytmusic:t" }],
        currentIndex: 0,
        context: { albumId: "ytmusic:a", type: "album" },
      },
      playback: {
        currentTrack: {
          streamUrl: "/stream/ytmusic:t?next=ytmusic:u",
          id: "ytmusic:t",
        },
        status: "playing",
        updatedAt: 200,
      },
      search: {
        tracks: [],
        albums: [{ artist: "Artist", title: "Album", id: "ytmusic:a" }],
      },
      library: {
        sourceIds: ["ytmusic:a"],
        placement: "discovery",
        title: "Album",
      },
    };

    const canonical = canonicalizeRpcParityPair(
      { legacy, effect },
      { volatileKeys: ["updatedAt"] },
    );

    expect(canonical.legacy).toEqual(canonical.effect);
    expect(JSON.stringify(canonical.legacy)).toContain("streamUrl");
    expect(JSON.stringify(canonical.legacy)).toContain("sourceIds");
    expect(JSON.stringify(canonical.legacy)).toContain("currentIndex");
  });
});
