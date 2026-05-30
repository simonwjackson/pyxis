/**
 * @module server/rpc/services/player
 * Effect service wrapping the singleton {@link PlayerService}. The live
 * layer delegates every method to the existing module-level functions so
 * web RPC, Android media bridge, and listen-log side effects continue to
 * observe one player state owner.
 *
 * U5 threads `appliesToTrackId` through the report/ended methods so the
 * underlying singleton can drop stale client reports without leaking that
 * concern into RPC handlers. The streaming RPC contract is built on top of
 * `subscribe` in `server/rpc/handlers/player.ts`.
 */

import { Context, Effect, Layer } from "effect";
import type { PlayerState } from "../../services/player.js";
import * as PlayerSingleton from "../../services/player.js";
import type { QueueContext, QueueTrack } from "../../services/queue.js";

/** Snapshot subscription callback. */
export type PlayerStateListener = (state: PlayerState) => void;

/**
 * Service surface. Every method delegates to the existing singleton; tests
 * that wire a custom backend (e.g. an in-process simulation) can supply a
 * `PlayerBehavior` that matches the same shape.
 */
export type PlayerShape = {
  readonly getState: Effect.Effect<PlayerState>;
  readonly play: (
    tracks?: readonly QueueTrack[],
    context?: QueueContext,
    startIndex?: number,
  ) => Effect.Effect<PlayerState>;
  readonly pause: Effect.Effect<PlayerState>;
  readonly resume: Effect.Effect<PlayerState>;
  readonly stop: Effect.Effect<PlayerState>;
  readonly skip: Effect.Effect<PlayerState>;
  readonly previous: Effect.Effect<PlayerState>;
  readonly jumpTo: (index: number) => Effect.Effect<PlayerState>;
  readonly seek: (position: number) => Effect.Effect<PlayerState>;
  readonly setVolume: (level: number) => Effect.Effect<PlayerState>;
  /**
   * Apply a client-reported duration. `appliesToTrackId` lets the singleton
   * drop stale reports from a previous track without emitting subscriber
   * updates. Resolves with the resulting player state.
   */
  readonly setDuration: (
    duration: number,
    appliesToTrackId?: string,
  ) => Effect.Effect<PlayerState>;
  /**
   * Apply a client-reported progress sample. Silent on success (no
   * subscriber notification). `appliesToTrackId` lets the singleton drop
   * stale samples from a previous track. Resolves with `true` when applied
   * and `false` when dropped as stale.
   */
  readonly reportProgress: (
    progress: number,
    appliesToTrackId?: string,
  ) => Effect.Effect<boolean>;
  /**
   * Capture a client-side audio error. `appliesToTrackId` drops reports
   * about previous tracks. Resolves with the resulting player state.
   */
  readonly reportAudioError: (
    message: string,
    appliesToTrackId?: string,
  ) => Effect.Effect<PlayerState>;
  /**
   * Track-ended report. `appliesToTrackId` drops late reports for previous
   * tracks so they cannot advance the queue twice. Resolves with the
   * resulting player state regardless of whether the queue advanced,
   * stopped, or the report was dropped as stale.
   */
  readonly trackEnded: (
    appliesToTrackId?: string,
  ) => Effect.Effect<PlayerState>;
  readonly subscribe: (
    listener: PlayerStateListener,
  ) => Effect.Effect<() => void>;
};

/** Effect Context.Service tag for {@link PlayerShape}. */
export class Player extends Context.Service<Player, PlayerShape>()(
  "Pyxis/Player",
) {}

/** Behavior knobs for an in-memory Player layer used by tests. */
export type PlayerBehavior = {
  readonly getState: () => PlayerState;
  readonly play: (
    tracks?: readonly QueueTrack[],
    context?: QueueContext,
    startIndex?: number,
  ) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
  readonly skip: () => void;
  readonly previous: () => void;
  readonly jumpTo: (index: number) => void;
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
  readonly trackEnded: (appliesToTrackId?: string) => void;
  readonly subscribe: (listener: PlayerStateListener) => () => void;
};

function makeShape(behavior: PlayerBehavior): PlayerShape {
  const afterCommand = (mutate: () => void) =>
    Effect.sync(() => {
      mutate();
      return behavior.getState();
    });

  return {
    getState: Effect.sync(() => behavior.getState()),
    play: (tracks, context, startIndex) =>
      afterCommand(() => behavior.play(tracks, context, startIndex)),
    pause: afterCommand(() => behavior.pause()),
    resume: afterCommand(() => behavior.resume()),
    stop: afterCommand(() => behavior.stop()),
    skip: afterCommand(() => behavior.skip()),
    previous: afterCommand(() => behavior.previous()),
    jumpTo: (index) => afterCommand(() => behavior.jumpTo(index)),
    seek: (position) => afterCommand(() => behavior.seek(position)),
    setVolume: (level) => afterCommand(() => behavior.setVolume(level)),
    setDuration: (duration, appliesToTrackId) =>
      afterCommand(() => {
        behavior.setDuration(duration, appliesToTrackId);
      }),
    reportProgress: (progress, appliesToTrackId) =>
      Effect.sync(() => behavior.reportProgress(progress, appliesToTrackId)),
    reportAudioError: (message, appliesToTrackId) =>
      afterCommand(() => {
        behavior.reportAudioError(message, appliesToTrackId);
      }),
    trackEnded: (appliesToTrackId) =>
      afterCommand(() => behavior.trackEnded(appliesToTrackId)),
    subscribe: (listener) => Effect.sync(() => behavior.subscribe(listener)),
  };
}

/** Build a Player layer from a configurable behavior. */
export function PlayerLayerFromBehavior(
  behavior: PlayerBehavior,
): Layer.Layer<Player> {
  return Layer.sync(Player)(() => makeShape(behavior));
}

/**
 * Live Player layer wrapping the module-level singleton. Production RPC
 * handlers consume this layer; Android media bridge and persistence
 * continue to call the singleton directly so all paths share state.
 */
export const PlayerLayerLive: Layer.Layer<Player> = Layer.sync(Player)(() =>
  makeShape({
    getState: () => PlayerSingleton.getState(),
    play: (tracks, context, startIndex) =>
      PlayerSingleton.play(tracks, context, startIndex),
    pause: () => PlayerSingleton.pause(),
    resume: () => PlayerSingleton.resume(),
    stop: () => PlayerSingleton.stop(),
    skip: () => {
      PlayerSingleton.skip();
    },
    previous: () => {
      PlayerSingleton.previousTrack();
    },
    jumpTo: (index) => {
      PlayerSingleton.jumpToIndex(index);
    },
    seek: (position) => PlayerSingleton.seek(position),
    setVolume: (level) => PlayerSingleton.setVolume(level),
    setDuration: (duration, appliesToTrackId) =>
      PlayerSingleton.setDuration(duration, appliesToTrackId),
    reportProgress: (progress, appliesToTrackId) =>
      PlayerSingleton.reportProgress(progress, appliesToTrackId),
    reportAudioError: (message, appliesToTrackId) =>
      PlayerSingleton.reportAudioError(message, appliesToTrackId),
    trackEnded: (appliesToTrackId) => {
      PlayerSingleton.trackEnded(appliesToTrackId);
    },
    subscribe: (listener) => PlayerSingleton.subscribe(listener),
  }),
);
