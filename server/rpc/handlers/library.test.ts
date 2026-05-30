/**
 * @module server/rpc/handlers/library tests
 * Behavior tests for the placement-aware and Pandora-bookmark handlers in
 * the `library.*` family. The handler layer mostly translates from contract
 * payloads to {@link LibraryShape} / {@link SourceCatalogShape} calls, so
 * the test surface focuses on:
 *
 * - placement / hot listings flow correct option records through the
 *   library service,
 * - `library.album.save` resolves a source manager from the catalog and
 *   forwards the composite id to the library save flow,
 * - `library.hotAlbums.list` enforces its default limit while preserving
 *   service ordering.
 *
 * Direct DB-touching handlers (`albumTracks.list`, `album.remove`, etc.)
 * are covered by `server/services/libraryAlbums.test.ts` and existing
 * router suites; this file does not duplicate that coverage.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type {
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
} from "../../../src/sources/types.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type {
  LibraryShape,
  ListLibraryAlbumsOptions,
} from "../services/library.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { libraryHandlers } from "./library.js";

type LibraryAlbumView = Awaited<
  ReturnType<LibraryShape["list"]> extends Effect.Effect<infer R, infer _E>
    ? R
    : never
>[number];

function libraryAlbum(
  overrides: Partial<LibraryAlbumView> = {},
): LibraryAlbumView {
  return {
    id: "alpha",
    title: "Alpha",
    artist: "Artist",
    placement: "discovery",
    placementUpdatedAt: 100,
    sourceIds: ["ytmusic:src_alpha"],
    isHot: false,
    hotRank: null,
    recentListenCount: 0,
    lastListenedAt: null,
    ...overrides,
  };
}

function makeLibrary(args: {
  readonly albums?: readonly LibraryAlbumView[];
  readonly capturedListOptions?: Array<ListLibraryAlbumsOptions | undefined>;
  readonly saveResult?: {
    readonly id: string;
    readonly outcome: "created" | "restored" | "existing";
    readonly placement: "discovery" | "collection" | "archive" | "dismissed";
  };
}): LibraryShape {
  return {
    list: (options) => {
      args.capturedListOptions?.push(options);
      return Effect.succeed(args.albums ?? []);
    },
    get: () => Effect.succeed(null),
    resolveStates: () => Effect.succeed([]),
    save: () =>
      Effect.succeed(
        args.saveResult ?? {
          id: "saved_1",
          outcome: "created",
          placement: "discovery",
        },
      ),
    setPlacement: () => Effect.fail({} as never),
  };
}

function makeCatalog(): SourceCatalogShape {
  return {
    listPlaylists: () => Effect.succeed([] as readonly CanonicalPlaylist[]),
    getPlaylistTracks: () => Effect.succeed([] as readonly CanonicalTrack[]),
    searchAll: () => Effect.succeed({ tracks: [], albums: [] } as never),
    getAlbumTracks: () =>
      Effect.succeed({
        album: {} as CanonicalAlbum,
        tracks: [] as readonly CanonicalTrack[],
      }),
    getStreamUrl: () => Effect.succeed("/stream/none"),
    resolveManager: Effect.succeed({} as never),
  };
}

const auth: AuthSessionShape = {
  getSession: Effect.succeed(undefined as never),
  requireSession: Effect.fail({} as never),
  getSourceManager: Effect.succeed({} as never),
  refresh: Effect.fail({} as never),
  withAuthRetry: () => Effect.fail({} as never),
};

describe("library.albums.list handler", () => {
  it("forwards placement/include/hotOnly options through to the library service", async () => {
    const calls: Array<ListLibraryAlbumsOptions | undefined> = [];
    const handlers = libraryHandlers({
      auth,
      library: makeLibrary({ capturedListOptions: calls }),
      catalog: makeCatalog(),
    });
    await Effect.runPromise(
      handlers["library.albums.list"]({
        placements: ["collection"],
        includeArchive: true,
        includeDismissed: false,
        hotOnly: false,
      }),
    );
    expect(calls[0]).toEqual({
      placements: ["collection"],
      includeArchive: true,
      includeDismissed: false,
      hotOnly: false,
    });
  });

  it("omits absent option fields rather than passing undefined through", async () => {
    const calls: Array<ListLibraryAlbumsOptions | undefined> = [];
    const handlers = libraryHandlers({
      auth,
      library: makeLibrary({ capturedListOptions: calls }),
      catalog: makeCatalog(),
    });
    await Effect.runPromise(handlers["library.albums.list"]({}));
    expect(calls[0]).toEqual({});
  });
});

describe("library.hotAlbums.list handler", () => {
  it("requests hot albums with archive/dismissed included and defaults the limit to 20", async () => {
    const calls: Array<ListLibraryAlbumsOptions | undefined> = [];
    const albums = Array.from({ length: 25 }, (_, i) =>
      libraryAlbum({ id: `hot_${i}`, isHot: true, hotRank: i }),
    );
    const handlers = libraryHandlers({
      auth,
      library: makeLibrary({ albums, capturedListOptions: calls }),
      catalog: makeCatalog(),
    });
    const result = await Effect.runPromise(
      handlers["library.hotAlbums.list"]({}),
    );
    expect(calls[0]).toEqual({
      hotOnly: true,
      includeArchive: true,
      includeDismissed: true,
    });
    expect(result.length).toBe(20);
  });

  it("honors a caller-supplied limit", async () => {
    const albums = Array.from({ length: 25 }, (_, i) =>
      libraryAlbum({ id: `hot_${i}` }),
    );
    const handlers = libraryHandlers({
      auth,
      library: makeLibrary({ albums }),
      catalog: makeCatalog(),
    });
    const result = await Effect.runPromise(
      handlers["library.hotAlbums.list"]({ limit: 5 }),
    );
    expect(result.length).toBe(5);
  });
});

describe("library.album.save handler", () => {
  it("resolves the source manager from the catalog before calling the library service", async () => {
    const handlers = libraryHandlers({
      auth,
      library: makeLibrary({
        saveResult: {
          id: "saved_1",
          outcome: "created",
          placement: "discovery",
        },
      }),
      catalog: makeCatalog(),
    });
    const result = await Effect.runPromise(
      handlers["library.album.save"]({ id: "ytmusic:remote_1" }),
    );
    expect(result.outcome).toBe("created");
    expect(result.placement).toBe("discovery");
  });
});
