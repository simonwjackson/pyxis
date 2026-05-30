import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
  ArtistIdInputSchema,
  ArtistSchema,
  ArtistSearchInputSchema,
  ArtistSearchResponseSchema,
} from "./artist.js";

describe("artist API contracts", () => {
  it("requires non-empty id for artist.get", () => {
    expect(
      Schema.decodeUnknownSync(ArtistIdInputSchema)({ id: "ytmusic:artist_1" }),
    ).toEqual({ id: "ytmusic:artist_1" });
    expect(() =>
      Schema.decodeUnknownSync(ArtistIdInputSchema)({ id: "" }),
    ).toThrow();
  });

  it("bounds artist search query length", () => {
    expect(
      Schema.decodeUnknownSync(ArtistSearchInputSchema)({ query: "abba" }),
    ).toEqual({ query: "abba" });
    expect(() =>
      Schema.decodeUnknownSync(ArtistSearchInputSchema)({ query: "" }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ArtistSearchInputSchema)({
        query: "x".repeat(257),
      }),
    ).toThrow();
  });

  it("decodes the current artist.get fallback shape with optional source", () => {
    expect(
      Schema.decodeUnknownSync(ArtistSchema)({
        id: "ytmusic:artist_1",
        name: "Artist",
        source: "ytmusic",
      }),
    ).toMatchObject({ source: "ytmusic" });
    expect(
      Schema.decodeUnknownSync(ArtistSchema)({
        id: "nanoidLike01",
        name: "Unknown",
      }),
    ).toMatchObject({ name: "Unknown" });
  });

  it("decodes derived artist search results", () => {
    const decoded = Schema.decodeUnknownSync(ArtistSearchResponseSchema)({
      artists: [{ id: "ytmusic:artist_1", name: "Artist" }],
    });
    expect(decoded.artists[0]?.id).toBe("ytmusic:artist_1");
  });
});
