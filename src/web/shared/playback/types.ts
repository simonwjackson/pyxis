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

export type PlaybackStatus = "stopped" | "paused" | "playing";

export type PlaybackContextValue = {
  readonly status: PlaybackStatus;
  readonly currentTrack: PlaybackTrack | null;
  readonly currentStationToken: string | null;
  readonly isPlaying: boolean;
  readonly progress: number;
  readonly duration: number;
  readonly error: string | null;
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
