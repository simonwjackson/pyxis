import { describe, expect, it } from "bun:test";
import type { QueueState } from "./queue.js";
import { streamRecoveryHintForQueue } from "./streamRecovery.js";

const restoredQueue: QueueState = {
  items: [
    {
      id: "pandora:persisted-token",
      title: "Persisted Song",
      artist: "Persisted Artist",
      album: "Persisted Album",
      duration: null,
      artworkUrl: null,
      source: "pandora",
    },
  ],
  currentIndex: 0,
  context: { type: "radio", seedId: "pandora:station-token" },
};

describe("stream recovery hints", () => {
  it("uses restored queue metadata and station context without media URLs", () => {
    expect(
      streamRecoveryHintForQueue(restoredQueue, "pandora:persisted-token"),
    ).toEqual({
      trackId: "pandora:persisted-token",
      title: "Persisted Song",
      artist: "Persisted Artist",
      album: "Persisted Album",
      origin: { type: "playlist", id: "station-token" },
    });
  });

  it("does not attach an origin from a different source", () => {
    expect(
      streamRecoveryHintForQueue(
        {
          ...restoredQueue,
          context: { type: "playlist", playlistId: "ytmusic:playlist" },
        },
        "pandora:persisted-token",
      ),
    ).toEqual({
      trackId: "pandora:persisted-token",
      title: "Persisted Song",
      artist: "Persisted Artist",
      album: "Persisted Album",
    });
  });
});
