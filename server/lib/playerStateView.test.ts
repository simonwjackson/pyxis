import { describe, expect, it } from "bun:test";
import type { PlayerState } from "../services/player.js";
import { toPlayerStateView } from "./playerStateView.js";

function stateWithTrack(): PlayerState {
  return {
    status: "playing",
    currentTrack: {
      id: "ytmusic:track-1",
      title: "Track",
      artist: "Artist",
      album: "Album",
      duration: 120,
      artworkUrl: "http://example.test/art.jpg",
      source: "ytmusic",
    },
    nextTrack: null,
    progress: 5,
    duration: 120,
    volume: 100,
    updatedAt: 1000,
    queueContext: { type: "manual" },
  };
}

describe("toPlayerStateView", () => {
  it("projects display metadata without stream URLs or source internals", () => {
    const view = toPlayerStateView(stateWithTrack());

    expect(view.currentTrack?.title).toBe("Track");
    expect("streamUrl" in (view.currentTrack ?? {})).toBe(false);
    expect("source" in (view.currentTrack ?? {})).toBe(false);
  });

  it("preserves stopped state without stale track metadata", () => {
    const view = toPlayerStateView({
      ...stateWithTrack(),
      status: "stopped",
      currentTrack: null,
      progress: 0,
      duration: 0,
    });

    expect(view.status).toBe("stopped");
    expect(view.currentTrack).toBeNull();
    expect(view.progress).toBe(0);
  });
});
