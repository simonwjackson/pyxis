/**
 * @module playerAuthority
 * Shared playback authority adapter used by plain HTTP bridges and Effect RPC.
 *
 * The live authority is intentionally singleton-backed while `server/services/player.ts`
 * remains the current state owner. Keeping that adapter explicit lets adjacent
 * runtimes share the same authority without importing the singleton directly.
 */

import type {
  AudioRealizationState,
  PlayerState,
} from "./player.js";
import * as PlayerSingleton from "./player.js";
import type { QueueContext, QueueTrack } from "./queue.js";

export type PlayerStateListener = (state: PlayerState) => void;

export type PlayerAuthority = {
  readonly getState: () => PlayerState;
  readonly getAudioRealization: () => AudioRealizationState;
  readonly play: (
    tracks?: readonly QueueTrack[],
    context?: QueueContext,
    startIndex?: number,
  ) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
  readonly skip: () => QueueTrack | undefined;
  readonly previousTrack: () => QueueTrack | undefined;
  readonly jumpToIndex: (index: number) => QueueTrack | undefined;
  readonly seek: (position: number) => void;
  readonly setVolume: (level: number) => void;
  readonly setDuration: (
    duration: number,
    appliesToTrackId?: string,
  ) => boolean;
  readonly reportProgress: (
    progress: number,
    appliesToTrackId?: string,
  ) => boolean;
  readonly reportAudioError: (
    message: string,
    appliesToTrackId?: string,
  ) => boolean;
  readonly trackEnded: (appliesToTrackId?: string) => QueueTrack | undefined;
  readonly subscribe: (listener: PlayerStateListener) => () => void;
};

const singletonPlayerAuthority: PlayerAuthority = {
  getState: () => PlayerSingleton.getState(),
  getAudioRealization: () => PlayerSingleton.getAudioRealization(),
  play: (tracks, context, startIndex) =>
    PlayerSingleton.play(tracks, context, startIndex),
  pause: () => PlayerSingleton.pause(),
  resume: () => PlayerSingleton.resume(),
  stop: () => PlayerSingleton.stop(),
  skip: () => PlayerSingleton.skip(),
  previousTrack: () => PlayerSingleton.previousTrack(),
  jumpToIndex: (index) => PlayerSingleton.jumpToIndex(index),
  seek: (position) => PlayerSingleton.seek(position),
  setVolume: (level) => PlayerSingleton.setVolume(level),
  setDuration: (duration, appliesToTrackId) =>
    PlayerSingleton.setDuration(duration, appliesToTrackId),
  reportProgress: (progress, appliesToTrackId) =>
    PlayerSingleton.reportProgress(progress, appliesToTrackId),
  reportAudioError: (message, appliesToTrackId) =>
    PlayerSingleton.reportAudioError(message, appliesToTrackId),
  trackEnded: (appliesToTrackId) =>
    PlayerSingleton.trackEnded(appliesToTrackId),
  subscribe: (listener) => PlayerSingleton.subscribe(listener),
};

export function getLivePlayerAuthority(): PlayerAuthority {
  return singletonPlayerAuthority;
}
