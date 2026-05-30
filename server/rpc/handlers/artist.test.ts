/**
 * @module server/rpc/handlers/artist tests
 * Contract behavior tests for the `artist.*` family. Both endpoints
 * preserve the limited semantics of `server/routers/artist.ts`:
 *
 * - `artist.get` echoes the encoded id with a placeholder name because no
 *   source has a dedicated artist API.
 * - `artist.search` derives artist entries from cross-source track search
 *   results, deduplicated by artist name.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type {
  CanonicalAlbum,
  CanonicalPlaylist,
  CanonicalTrack,
} from "../../../src/sources/types.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { artistHandlers } from "./artist.js";

function makeCatalog(
  tracks: readonly CanonicalTrack[],
  albums: readonly CanonicalAlbum[] = [],
): SourceCatalogShape {
  return {
    listPlaylists: () => Effect.succeed([] as readonly CanonicalPlaylist[]),
    getPlaylistTracks: () => Effect.succeed([] as readonly CanonicalTrack[]),
    searchAll: () =>
      Effect.succeed({
        tracks,
        albums,
      }),
    getAlbumTracks: () =>
      Effect.fail({
        _tag: "NotFound" as const,
        resource: "album",
      }) as never,
    getStreamUrl: () => Effect.succeed("/stream/none"),
    resolveManager: Effect.succeed({} as never),
  };
}

describe("artist handlers", () => {
  it("artist.get returns the encoded id with a placeholder name", async () => {
    const handlers = artistHandlers({ catalog: makeCatalog([]) });
    const result = await Effect.runPromise(
      handlers["artist.get"]({ id: "ytmusic:abc" }),
    );
    expect(result).toEqual({
      id: "ytmusic:abc",
      name: "Unknown",
      source: "ytmusic",
    });
  });

  it("artist.get returns source 'unknown' for bare ids", async () => {
    const handlers = artistHandlers({ catalog: makeCatalog([]) });
    const result = await Effect.runPromise(
      handlers["artist.get"]({ id: "library_nanoid" }),
    );
    expect(result.source).toBe("unknown");
  });

  it("artist.search deduplicates by artist name and encodes ids", async () => {
    const tracks: CanonicalTrack[] = [
      {
        sourceId: { source: "ytmusic", id: "t1" },
        title: "Song 1",
        artist: "Alpha",
        album: "Album",
      },
      {
        sourceId: { source: "ytmusic", id: "t2" },
        title: "Song 2",
        artist: "Alpha",
        album: "Album",
      },
      {
        sourceId: { source: "ytmusic", id: "t3" },
        title: "Song 3",
        artist: "Beta",
        album: "Album",
      },
    ];
    const handlers = artistHandlers({ catalog: makeCatalog(tracks) });
    const result = await Effect.runPromise(
      handlers["artist.search"]({ query: "alpha" }),
    );
    expect(result.artists).toEqual([
      { id: "ytmusic:t1", name: "Alpha" },
      { id: "ytmusic:t3", name: "Beta" },
    ]);
  });
});
