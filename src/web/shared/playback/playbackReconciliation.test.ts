import { describe, expect, it } from "bun:test";
import type { ApiPlayerState } from "../../../api/contracts/player.js";
import { BrowserAudio } from "./browserAudio";
import {
  reconcilePlaybackState,
  type PlaybackAudioAction,
} from "./playbackReconciliation";

const track = (id = "ytmusic:a", streamUrl = "/stream/ytmusic:a") => ({
  id,
  title: `Title ${id}`,
  artist: "Artist",
  album: "Album",
  duration: 180,
  artworkUrl: "https://example.test/art.jpg",
  streamUrl,
});

const serverState = (
  overrides: Partial<ApiPlayerState> = {},
): ApiPlayerState => ({
  status: "playing",
  currentTrack: track(),
  progress: 42,
  duration: 180,
  volume: 75,
  updatedAt: 123,
  ...overrides,
});

const pausedAudio = (overrides = {}) => ({
  src: "/stream/ytmusic:a",
  paused: true,
  currentTime: 10,
  readyState: BrowserAudio.haveMetadata,
  ...overrides,
});

const actionTags = (actions: readonly PlaybackAudioAction[]) =>
  actions.map((action) => action._tag);

describe("reconcilePlaybackState", () => {
  it("loads but does not autoplay a new track on the first server snapshot", () => {
    const result = reconcilePlaybackState({
      serverState: serverState(),
      source: "sse",
      audio: pausedAudio({ src: "" }),
      lastStreamUrl: null,
      hasReceivedInitialState: false,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(actionTags(result.actions)).toEqual(["Load", "Seek", "SetVolume"]);
    expect(result.statePatch.isPlaying).toBe(false);
    expect(result.statePatch.progress).toBe(42);
    expect(result.nextLastStreamUrl).toBe("/stream/ytmusic:a");
    expect(result.nextHasReceivedInitialState).toBe(true);
  });

  it("resumes the same track after reconnect when server is playing", () => {
    const result = reconcilePlaybackState({
      serverState: serverState({ progress: 12 }),
      source: "sse",
      audio: pausedAudio({ currentTime: 12 }),
      lastStreamUrl: "/stream/ytmusic:a",
      hasReceivedInitialState: true,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(actionTags(result.actions)).toEqual(["Play", "SetVolume"]);
    expect(result.statePatch.isPlaying).toBe(true);
    expect(result.statePatch.progress).toBeNull();
  });

  it("pauses same-track audio when authoritative server state is paused", () => {
    const result = reconcilePlaybackState({
      serverState: serverState({ status: "paused" }),
      source: "sse",
      audio: pausedAudio({ paused: false }),
      lastStreamUrl: "/stream/ytmusic:a",
      hasReceivedInitialState: true,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(actionTags(result.actions)).toEqual(["Pause", "SetVolume"]);
    expect(result.statePatch.isPlaying).toBe(false);
  });

  it("seeks before same-track resume when server progress has drifted", () => {
    const result = reconcilePlaybackState({
      serverState: serverState({ progress: 90 }),
      source: "sse",
      audio: pausedAudio({ currentTime: 10 }),
      lastStreamUrl: "/stream/ytmusic:a",
      hasReceivedInitialState: true,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(result.actions).toEqual([
      { _tag: "Seek", position: 90, when: "now" },
      { _tag: "Play", context: "same track resume" },
      { _tag: "SetVolume", volume: 0.75 },
    ]);
  });

  it("loads and plays when a non-initial snapshot points at a new stream URL", () => {
    const result = reconcilePlaybackState({
      serverState: serverState({
        currentTrack: track("ytmusic:b", "/stream/ytmusic:b?next=1"),
        progress: 0,
      }),
      source: "skip-response",
      audio: pausedAudio(),
      lastStreamUrl: "/stream/ytmusic:a",
      hasReceivedInitialState: true,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(actionTags(result.actions)).toEqual(["Load", "Play", "SetVolume"]);
    expect(result.statePatch.currentTrack?.trackToken).toBe("ytmusic:b");
    expect(result.statePatch.isPlaying).toBe(true);
    expect(result.nextLastStreamUrl).toBe("/stream/ytmusic:b?next=1");
  });

  it("stops and clears local track state when server has no current track", () => {
    const result = reconcilePlaybackState({
      serverState: serverState({ status: "stopped", currentTrack: null }),
      source: "sse",
      audio: pausedAudio({ paused: false }),
      lastStreamUrl: "/stream/ytmusic:a",
      hasReceivedInitialState: true,
      haveMetadata: BrowserAudio.haveMetadata,
    });

    expect(actionTags(result.actions)).toEqual(["Pause"]);
    expect(result.statePatch).toEqual({
      currentTrack: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
    });
    expect(result.nextLastStreamUrl).toBeNull();
  });
});

describe("BrowserAudio.describeError", () => {
  it("describes audio errors for reporting through the playback boundary", () => {
    expect(BrowserAudio.describeError({ code: 2, message: "offline" })).toBe(
      "Network error loading audio: offline",
    );
    expect(BrowserAudio.describeError(null)).toBe("Audio playback failed");
  });
});
