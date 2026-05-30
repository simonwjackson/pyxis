/**
 * @module server/rpc/handlers/album tests
 * Behavior tests for the `album.*` handlers. The handlers preserve the
 * batched `SourceManager.getAlbumTracks` workflow, so the tests assert:
 *
 * - source-prefixed ids are decoded into source + raw id before the catalog
 *   call,
 * - `album.withTracks.get` returns the batched header + indexed track list
 *   without performing two upstream calls,
 * - bare nanoid ids fail with a typed ValidationError before reaching the
 *   catalog.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type {
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
  SourceType,
} from "@shared/sources/types.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { albumHandlers } from "./album.js";

type AlbumCall = { readonly source: SourceType; readonly albumId: string };

function makeCatalog(args: {
  readonly album: CanonicalAlbum;
  readonly tracks: readonly CanonicalTrack[];
  readonly calls: AlbumCall[];
}): SourceCatalogShape {
  return {
    listPlaylists: () => Effect.succeed([] as readonly CanonicalPlaylist[]),
    getPlaylistTracks: () => Effect.succeed([] as readonly CanonicalTrack[]),
    searchAll: () => Effect.succeed({ tracks: [], albums: [] } as never),
    getAlbumTracks: (_manager, source, albumId) => {
      args.calls.push({ source, albumId });
      return Effect.succeed({ album: args.album, tracks: args.tracks });
    },
    getStreamUrl: () => Effect.succeed("/stream/none"),
    resolveManager: Effect.succeed({} as never),
  };
}

const sampleAlbum: CanonicalAlbum = {
  id: "ytmusic:remote_1",
  title: "Remote Album",
  artist: "Remote Artist",
  year: 2024,
  artworkUrl: "https://artwork/remote.jpg",
  sourceIds: [{ source: "ytmusic", id: "remote_1" }],
  tracks: [],
};

const sampleTracks: readonly CanonicalTrack[] = [
  {
    sourceId: { source: "ytmusic", id: "rt1" },
    title: "Track 1",
    artist: "Remote Artist",
    album: "Remote Album",
    duration: 200,
  },
  {
    sourceId: { source: "ytmusic", id: "rt2" },
    title: "Track 2",
    artist: "Remote Artist",
    album: "Remote Album",
  },
];

describe("album handlers", () => {
  it("album.get parses source-prefixed ids and returns the encoded header", async () => {
    const calls: AlbumCall[] = [];
    const handlers = albumHandlers({
      catalog: makeCatalog({ album: sampleAlbum, tracks: [], calls }),
    });
    const header = await Effect.runPromise(
      handlers["album.get"]({ id: "ytmusic:remote_1" }),
    );
    expect(calls).toEqual([{ source: "ytmusic", albumId: "remote_1" }]);
    expect(header).toEqual({
      id: "ytmusic:remote_1",
      title: "Remote Album",
      artist: "Remote Artist",
      year: 2024,
      artworkUrl: "https://artwork/remote.jpg",
    });
  });

  it("album.tracks.list returns encoded tracks for the requested album", async () => {
    const calls: AlbumCall[] = [];
    const handlers = albumHandlers({
      catalog: makeCatalog({
        album: sampleAlbum,
        tracks: sampleTracks,
        calls,
      }),
    });
    const tracks = await Effect.runPromise(
      handlers["album.tracks.list"]({ id: "ytmusic:remote_1" }),
    );
    expect(tracks.map((t) => t.id)).toEqual(["ytmusic:rt1", "ytmusic:rt2"]);
    expect(tracks[0]).toEqual({
      id: "ytmusic:rt1",
      title: "Track 1",
      artist: "Remote Artist",
      album: "Remote Album",
      duration: 200,
    });
  });

  it("album.withTracks.get returns the batched album + indexed tracks in one call", async () => {
    const calls: AlbumCall[] = [];
    const handlers = albumHandlers({
      catalog: makeCatalog({
        album: sampleAlbum,
        tracks: sampleTracks,
        calls,
      }),
    });
    const result = await Effect.runPromise(
      handlers["album.withTracks.get"]({ id: "ytmusic:remote_1" }),
    );
    expect(calls.length).toBe(1);
    expect(result.album.title).toBe("Remote Album");
    expect(result.tracks.map((t) => t.trackIndex)).toEqual([0, 1]);
    expect(result.tracks[0]?.capabilities).toEqual({
      feedback: false,
      sleep: false,
      bookmark: false,
      explain: false,
      radio: true,
    });
  });

  it("album.get fails with a typed ValidationError on a bare nanoid id", async () => {
    const calls: AlbumCall[] = [];
    const handlers = albumHandlers({
      catalog: makeCatalog({ album: sampleAlbum, tracks: [], calls }),
    });
    const exit = await Effect.runPromise(
      Effect.exit(handlers["album.get"]({ id: "bareid" })),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const cause = exit.cause as { _tag?: string; error?: { _tag?: string } };
      // catchDefect+mapError leaves a typed failure cause; extract via toJSON.
      expect(JSON.stringify(cause)).toContain("ValidationError");
    }
    expect(calls.length).toBe(0);
  });
});
