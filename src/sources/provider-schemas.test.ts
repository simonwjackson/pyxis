import { describe, expect, it } from "bun:test";
import { AutocompleteResultSchema } from "./bandcamp/schemas.js";
import { AlbumSearchResultSchema, ErrorResponseSchema } from "./deezer/schemas.js";
import {
  DiscogsMasterSchema,
  DiscogsSearchResponseSchema,
} from "./discogs/schemas.js";
import {
  ArtistSearchResultSchema,
  ReleaseGroupSearchResultSchema,
} from "./musicbrainz/schemas.js";
import {
  PlaylistSearchResultSchema,
  TrackSchema as SoundCloudTrackSchema,
} from "./soundcloud/schemas.js";

describe("provider response Effect schemas", () => {
  it("decodes representative provider responses through the parse seam", () => {
    expect(
      AutocompleteResultSchema.parse({
        auto: { results: [{ type: "a", id: 1, name: "Album" }] },
      }).auto.results[0]?.type,
    ).toBe("a");

    expect(
      AlbumSearchResultSchema.parse({
        data: [{ id: 1, title: "Album", artist: { id: 2, name: "Artist" } }],
      }).data[0]?.artist?.name,
    ).toBe("Artist");

    expect(
      DiscogsSearchResponseSchema.parse({
        pagination: { page: 1, pages: 1, per_page: 50, items: 1 },
        results: [
          {
            id: 1,
            type: "master",
            title: "Artist - Album",
            resource_url: "https://api.discogs.example/master/1",
            uri: "/master/1",
          },
        ],
      }).results[0]?.type,
    ).toBe("master");

    expect(
      ArtistSearchResultSchema.parse({
        count: 1,
        offset: 0,
        artists: [{ id: "artist-id", name: "Artist" }],
      }).artists[0]?.name,
    ).toBe("Artist");

    expect(
      PlaylistSearchResultSchema.parse({
        collection: [{ id: 1, title: "Playlist" }],
      }).collection[0]?.title,
    ).toBe("Playlist");
  });

  it("rejects invalid provider response invariants", () => {
    expect(() =>
      AutocompleteResultSchema.parse({
        auto: { results: [{ type: "invalid", id: 1, name: "Album" }] },
      }),
    ).toThrow();

    expect(() => ErrorResponseSchema.parse({ error: { message: "oops" } }))
      .toThrow();

    expect(() =>
      DiscogsMasterSchema.parse({
        id: 1,
        title: "Album",
        artists: [{ id: 2, name: "Artist", resource_url: "url" }],
        genres: ["Rock"],
        tracklist: [{ position: "1" }],
        main_release: 1,
        resource_url: "url",
        uri: "/master/1",
      }),
    ).toThrow();

    expect(() =>
      ReleaseGroupSearchResultSchema.parse({
        count: 1,
        offset: 0,
        "release-groups": [{ id: 1 }],
      }),
    ).toThrow();

    expect(() =>
      SoundCloudTrackSchema.parse({ id: "not-a-number" }),
    ).toThrow();
  });

  it("keeps the safeParse compatibility seam for clients with explicit error branches", () => {
    const result = ErrorResponseSchema.safeParse({
      error: { type: "Exception", message: "bad request", code: 400 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error.code).toBe(400);
    }

    expect(ErrorResponseSchema.safeParse({ error: { code: "bad" } }).success)
      .toBe(false);
  });
});
