import { describe, expect, it } from "bun:test";
import {
  colorFromId,
  type QueueCoverflowTrack,
  queueCoverflowTracksFromAlbums,
  toQueueCoverflowTrack,
} from "./QueueCoverflowState.js";

const fallback: QueueCoverflowTrack[] = [
  {
    id: "fallback",
    title: "Fallback",
    artist: "Fixture",
    artwork: "https://example.com/fallback.jpg",
    dominantColor: "#333333",
  },
];

describe("QueueCoverflowState", () => {
  it("projects album fixtures with artwork into coverflow tracks", () => {
    expect(
      toQueueCoverflowTrack({
        id: "album-1",
        title: "Album",
        artist: "Artist",
        artworkUrl: "https://example.com/album.jpg",
      }),
    ).toEqual({
      id: "album-1",
      title: "Album",
      artist: "Artist",
      artwork: "https://example.com/album.jpg",
      dominantColor: colorFromId("album-1"),
    });
  });

  it("drops album fixtures without artwork", () => {
    expect(
      toQueueCoverflowTrack({
        id: "album-1",
        title: "Album",
        artist: "Artist",
        artworkUrl: null,
      }),
    ).toBeNull();
  });

  it("falls back to bundled mock tracks when no album fixtures are usable", () => {
    expect(
      queueCoverflowTracksFromAlbums(
        [{ id: "album-1", title: "Album", artist: "Artist" }],
        fallback,
      ),
    ).toBe(fallback);
  });
});
