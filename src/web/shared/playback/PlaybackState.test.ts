import { describe, expect, it } from "bun:test";
import type { PlaybackTrack } from "./types";
import { PlaybackState } from "./types";

const track: PlaybackTrack = {
  trackToken: "pandora:abc",
  songName: "Song",
  artistName: "Artist",
  albumName: "Album",
  audioUrl: "/stream/pandora:abc",
};

describe("PlaybackState helpers", () => {
  describe("currentTrack", () => {
    it("returns null when stopped", () => {
      expect(PlaybackState.currentTrack({ _tag: "Stopped" })).toBeNull();
    });

    it("returns the playing track when Playing", () => {
      expect(
        PlaybackState.currentTrack({
          _tag: "Playing",
          track,
          stationToken: "station-1",
        }),
      ).toBe(track);
    });

    it("returns the paused track when Paused", () => {
      expect(
        PlaybackState.currentTrack({
          _tag: "Paused",
          track,
          stationToken: null,
        }),
      ).toBe(track);
    });

    it("returns the last loaded track when Failed", () => {
      expect(
        PlaybackState.currentTrack({
          _tag: "Failed",
          error: "boom",
          track,
          stationToken: null,
        }),
      ).toBe(track);
    });

    it("returns null when Failed without a track", () => {
      expect(
        PlaybackState.currentTrack({
          _tag: "Failed",
          error: "boom",
          track: null,
          stationToken: null,
        }),
      ).toBeNull();
    });
  });

  describe("currentStationToken", () => {
    it("returns null when Stopped", () => {
      expect(PlaybackState.currentStationToken({ _tag: "Stopped" })).toBeNull();
    });

    it("preserves a non-null station token from Playing", () => {
      expect(
        PlaybackState.currentStationToken({
          _tag: "Playing",
          track,
          stationToken: "station-7",
        }),
      ).toBe("station-7");
    });

    it("preserves a null station token from Paused", () => {
      expect(
        PlaybackState.currentStationToken({
          _tag: "Paused",
          track,
          stationToken: null,
        }),
      ).toBeNull();
    });

    it("preserves station token from Failed", () => {
      expect(
        PlaybackState.currentStationToken({
          _tag: "Failed",
          error: "boom",
          track,
          stationToken: "station-3",
        }),
      ).toBe("station-3");
    });
  });

  describe("error", () => {
    it("returns the message when Failed", () => {
      expect(
        PlaybackState.error({
          _tag: "Failed",
          error: "Audio decode error",
          track: null,
          stationToken: null,
        }),
      ).toBe("Audio decode error");
    });

    it("returns null for Stopped, Playing, and Paused", () => {
      expect(PlaybackState.error({ _tag: "Stopped" })).toBeNull();
      expect(
        PlaybackState.error({
          _tag: "Playing",
          track,
          stationToken: null,
        }),
      ).toBeNull();
      expect(
        PlaybackState.error({
          _tag: "Paused",
          track,
          stationToken: null,
        }),
      ).toBeNull();
    });
  });

  describe("isPlaying", () => {
    it("is true only when in the Playing state", () => {
      expect(
        PlaybackState.isPlaying({
          _tag: "Playing",
          track,
          stationToken: null,
        }),
      ).toBe(true);
      expect(PlaybackState.isPlaying({ _tag: "Stopped" })).toBe(false);
      expect(
        PlaybackState.isPlaying({
          _tag: "Paused",
          track,
          stationToken: null,
        }),
      ).toBe(false);
      expect(
        PlaybackState.isPlaying({
          _tag: "Failed",
          error: "boom",
          track,
          stationToken: null,
        }),
      ).toBe(false);
    });
  });
});
