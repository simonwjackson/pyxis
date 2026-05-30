import type { SourceType } from "../../../sources/types.js";

export type PlaybackTrack = {
  /** Opaque track token (source:trackId format) */
  readonly trackToken: string;
  /** Track title */
  readonly songName: string;
  /** Artist name */
  readonly artistName: string;
  /** Album name */
  readonly albumName: string;
  /** Direct audio stream URL */
  readonly audioUrl: string;
  /** Album artwork URL */
  readonly artUrl?: string;
  /** Source backend (pandora, ytmusic, etc.) */
  readonly source?: SourceType;
};

export type PlaybackQueueTrack = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: number | null;
  readonly artworkUrl: string | null;
};

export type PlaybackQueueContext =
  | { readonly type: "radio"; readonly seedId: string }
  | { readonly type: "album"; readonly albumId: string }
  | { readonly type: "playlist"; readonly playlistId: string }
  | { readonly type: "manual" };

export type PlaybackQueueRequest = {
  readonly tracks: readonly PlaybackQueueTrack[];
  readonly context: PlaybackQueueContext;
  readonly startIndex?: number;
};

/**
 * Discriminated-union playback state. Replaces the legacy bag of
 * `status` + `isPlaying` + nullable currentTrack/error fields.
 *
 * - Stopped: no audio loaded; mutations like `playTrack` move into Playing.
 * - Playing: audio is playing; `track` is always defined.
 * - Paused: audio is paused; `track` is always defined.
 * - Failed: last attempt errored; `track` may or may not be loaded.
 */
export type PlaybackState =
  | { readonly _tag: "Stopped" }
  | {
      readonly _tag: "Playing";
      readonly track: PlaybackTrack;
      readonly stationToken: string | null;
    }
  | {
      readonly _tag: "Paused";
      readonly track: PlaybackTrack;
      readonly stationToken: string | null;
    }
  | {
      readonly _tag: "Failed";
      readonly error: string;
      readonly track: PlaybackTrack | null;
      readonly stationToken: string | null;
    };

export const PlaybackState = {
  /** Currently loaded track, or null when the player is Stopped or Failed without a track. */
  currentTrack: (state: PlaybackState): PlaybackTrack | null => {
    switch (state._tag) {
      case "Stopped":
        return null;
      case "Playing":
      case "Paused":
        return state.track;
      case "Failed":
        return state.track;
    }
  },
  /** Station token for radio context, or null for non-radio or stopped states. */
  currentStationToken: (state: PlaybackState): string | null => {
    switch (state._tag) {
      case "Stopped":
        return null;
      case "Playing":
      case "Paused":
      case "Failed":
        return state.stationToken;
    }
  },
  /** Last error message when in Failed state, null otherwise. */
  error: (state: PlaybackState): string | null =>
    state._tag === "Failed" ? state.error : null,
  /** True only while audio is actively playing (not paused, stopped, or failed). */
  isPlaying: (state: PlaybackState): boolean => state._tag === "Playing",
};

export type PlaybackContextValue = {
  /** Single-source-of-truth state ADT. Consumers read currentTrack, error, etc. via `PlaybackState.*` selectors. */
  readonly state: PlaybackState;
  /** Current playback position in seconds. */
  readonly progress: number;
  /** Total track duration in seconds, 0 when no track is loaded. */
  readonly duration: number;
  /** Volume level from 0-100. */
  readonly volume: number;
  playTrack: (track: PlaybackTrack) => void;
  playQueue: (request: PlaybackQueueRequest) => void;
  togglePlayPause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  triggerSkip: () => void;
  triggerPrevious: () => void;
  clearError: () => void;
};
