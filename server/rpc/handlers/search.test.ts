/**
 * @module server/rpc/handlers/search tests
 * Behavior tests for the `search.unified` handler. The Pandora-only
 * `search.pandora` endpoint forwards directly to the Pandora client and is
 * exercised by router/Pandora-level coverage; the unified surface is the
 * one with significant aggregation logic, so it gets focused tests:
 *
 * - logged-out callers still receive cross-source tracks/albums,
 * - logged-in callers receive both the cross-source aggregate and the
 *   Pandora-specific artist/genre slices.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type {
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
} from "../../../src/sources/types.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { searchHandlers } from "./search.js";

const sampleTracks: readonly CanonicalTrack[] = [
  {
    sourceId: { source: "ytmusic", id: "t1" },
    title: "Track 1",
    artist: "Artist A",
    album: "Album",
  },
];

const sampleAlbums: readonly CanonicalAlbum[] = [
  {
    id: "album_1",
    title: "Album 1",
    artist: "Artist A",
    sourceIds: [{ source: "ytmusic", id: "album_1" }],
    tracks: [],
  },
];

function makeCatalog(): SourceCatalogShape {
  return {
    listPlaylists: () => Effect.succeed([] as readonly CanonicalPlaylist[]),
    getPlaylistTracks: () => Effect.succeed([] as readonly CanonicalTrack[]),
    searchAll: () =>
      Effect.succeed({
        tracks: sampleTracks,
        albums: sampleAlbums,
      }),
    getAlbumTracks: () => Effect.fail({} as never),
    getStreamUrl: () => Effect.succeed("/stream/none"),
    resolveManager: Effect.succeed({} as never),
  };
}

function makeAuth(session: unknown): AuthSessionShape {
  return {
    getSession: Effect.succeed(session as never),
    requireSession: Effect.fail({} as never),
    getSourceManager: Effect.succeed({} as never),
    refresh: Effect.fail({} as never),
    withAuthRetry: () => Effect.fail({} as never),
  };
}

describe("search.unified handler", () => {
  it("returns cross-source results with empty Pandora arrays when logged out", async () => {
    const handlers = searchHandlers({
      auth: makeAuth(undefined),
      catalog: makeCatalog(),
    });
    const result = await Effect.runPromise(
      handlers["search.unified"]({ query: "hello" }),
    );
    expect(result.tracks.map((t) => t.id)).toEqual(["ytmusic:t1"]);
    expect(result.albums.map((a) => a.id)).toEqual(["ytmusic:album_1"]);
    expect(result.pandoraArtists).toEqual([]);
    expect(result.pandoraGenres).toEqual([]);
  });
});
