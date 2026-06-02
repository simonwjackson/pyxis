import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createSourceManager } from "@shared/sources/index.js";
import type {
  CanonicalAlbum,
  CanonicalTrack,
  Source,
} from "@shared/sources/types.js";
import {
  SourceCatalog,
  SourceCatalogLayerFromBehavior,
} from "./sourceCatalog.js";

const track = (source = "ytmusic", id = "track_1"): CanonicalTrack => ({
  sourceId: { source: source as never, id },
  id,
  title: `${source} track`,
  artist: "Artist",
  album: "Album",
});

const album: CanonicalAlbum = {
  id: "album_1",
  title: "Album",
  artist: "Artist",
  sourceIds: [{ source: "ytmusic", id: "album_1" }],
  tracks: [],
};

function runWithCatalog<A>(
  source: Source,
  effect: Effect.Effect<A, unknown, SourceCatalog>,
) {
  return Effect.runPromise(
    Effect.provide(
      effect,
      SourceCatalogLayerFromBehavior({
        resolveManager: async () => createSourceManager([source]),
      }),
    ),
  );
}

describe("SourceCatalog", () => {
  it("runs cross-source search through a manager it resolves internally", async () => {
    const ytmusic: Source = {
      type: "ytmusic",
      name: "YTMusic",
      search: async () => ({ tracks: [track("ytmusic", "yt_1")], albums: [] }),
    };
    const bandcamp: Source = {
      type: "bandcamp",
      name: "Bandcamp",
      search: async () => ({ tracks: [track("bandcamp", "bc_1")], albums: [] }),
    };

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const catalog = yield* SourceCatalog;
          return yield* catalog.searchAll("artist");
        }),
        SourceCatalogLayerFromBehavior({
          resolveManager: async () => createSourceManager([ytmusic, bandcamp]),
        }),
      ),
    );

    expect(result.tracks.map((t) => t.sourceId)).toEqual([
      { source: "ytmusic", id: "yt_1" },
      { source: "bandcamp", id: "bc_1" },
    ]);
  });

  it("loads album tracks from a source-prefixed album id", async () => {
    const source: Source = {
      type: "ytmusic",
      name: "YTMusic",
      getAlbumTracks: async (albumId) => ({
        album: { ...album, id: albumId },
        tracks: [track("ytmusic", "t1")],
      }),
    };

    const result = await runWithCatalog(
      source,
      Effect.gen(function* () {
        const catalog = yield* SourceCatalog;
        return yield* catalog.getAlbumTracks("ytmusic:album_1");
      }),
    );

    expect(result.album.id).toBe("album_1");
    expect(result.tracks.map((t) => t.sourceId.id)).toEqual(["t1"]);
  });

  it("loads playlist tracks from a source-prefixed playlist id", async () => {
    const source: Source = {
      type: "ytmusic",
      name: "YTMusic",
      listPlaylists: async () => [],
      getPlaylistTracks: async (playlistId) => [track("ytmusic", playlistId)],
    };

    const result = await runWithCatalog(
      source,
      Effect.gen(function* () {
        const catalog = yield* SourceCatalog;
        return yield* catalog.getPlaylistTracks("ytmusic:playlist_1");
      }),
    );

    expect(result.map((t) => t.sourceId.id)).toEqual(["playlist_1"]);
  });

  it("maps missing source capability to SourceUnavailable instead of leaking the upstream error", async () => {
    const source: Source = { type: "ytmusic", name: "YTMusic" };

    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.gen(function* () {
            const catalog = yield* SourceCatalog;
            return yield* catalog.getPlaylistTracks("ytmusic:playlist_1");
          }),
          SourceCatalogLayerFromBehavior({
            resolveManager: async () => createSourceManager([source]),
          }),
        ),
      ),
    );

    expect(JSON.stringify(exit)).toContain("SourceUnavailable");
    expect(JSON.stringify(exit)).toContain("ytmusic_playlist_unsupported");
  });

  it("maps provider not-found failures to the public NotFound error", async () => {
    const source: Source = {
      type: "ytmusic",
      name: "YTMusic",
      getAlbumTracks: async () => {
        throw new Error("album not found");
      },
    };

    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.gen(function* () {
            const catalog = yield* SourceCatalog;
            return yield* catalog.getAlbumTracks("ytmusic:missing_album");
          }),
          SourceCatalogLayerFromBehavior({
            resolveManager: async () => createSourceManager([source]),
          }),
        ),
      ),
    );

    expect(JSON.stringify(exit)).toContain("NotFound");
    expect(JSON.stringify(exit)).toContain("album.tracks");
  });

  it("rejects bare album ids before a source manager operation runs", async () => {
    let resolved = false;
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.gen(function* () {
            const catalog = yield* SourceCatalog;
            return yield* catalog.getAlbumTracks("bare_album_id");
          }),
          SourceCatalogLayerFromBehavior({
            resolveManager: async () => {
              resolved = true;
              return createSourceManager([]);
            },
          }),
        ),
      ),
    );

    expect(resolved).toBe(false);
    expect(JSON.stringify(exit)).toContain("album_id_requires_source_prefix");
  });

  it("validates stream ids and returns the public /stream URL through the catalog seam", async () => {
    const source: Source = {
      type: "ytmusic",
      name: "YTMusic",
      getStreamUrl: async () => "https://example.test/audio.webm",
    };

    const result = await runWithCatalog(
      source,
      Effect.gen(function* () {
        const catalog = yield* SourceCatalog;
        return yield* catalog.getStreamUrl("ytmusic:track_1", "ytmusic:track_2");
      }),
    );

    expect(result).toBe("/stream/ytmusic%3Atrack_1?next=ytmusic%3Atrack_2");
  });
});
