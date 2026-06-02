/**
 * @module server/rpc/services/player
 * Effect service for the shared player authority. The live layer delegates
 * through the singleton-backed authority adapter so web RPC, Android media
 * bridge, and listen-log side effects continue to observe one player state
 * owner without each runtime importing the singleton directly.
 *
 * U5 threads `appliesToTrackId` through the report/ended methods so the
 * underlying singleton can drop stale client reports without leaking that
 * concern into RPC handlers. The streaming RPC contract is built on top of
 * `subscribe` in `server/rpc/handlers/player.ts`.
 */

import { Context, Effect, Layer } from "effect";
import type { PlayerState } from "../../services/player.js";
import {
  getLivePlayerAuthority,
  type PlayerAuthority,
  type PlayerStateListener,
} from "../../services/playerAuthority.js";
import type { QueueContext, QueueTrack } from "../../services/queue.js";

/**
 * Service surface. Every method delegates to the configured player authority;
 * tests that wire a custom backend can supply a `PlayerAuthority` that matches
 * the same shape.
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

function makeShape(authority: PlayerAuthority): PlayerShape {
  const afterCommand = (mutate: () => void) =>
    Effect.sync(() => {
      mutate();
      return authority.getState();
    });

  return {
    getState: Effect.sync(() => authority.getState()),
    play: (tracks, context, startIndex) =>
      afterCommand(() => authority.play(tracks, context, startIndex)),
    pause: afterCommand(() => authority.pause()),
    resume: afterCommand(() => authority.resume()),
    stop: afterCommand(() => authority.stop()),
    skip: afterCommand(() => authority.skip()),
    previous: afterCommand(() => authority.previousTrack()),
    jumpTo: (index) => afterCommand(() => authority.jumpToIndex(index)),
    seek: (position) => afterCommand(() => authority.seek(position)),
    setVolume: (level) => afterCommand(() => authority.setVolume(level)),
    setDuration: (duration, appliesToTrackId) =>
      afterCommand(() => {
        authority.setDuration(duration, appliesToTrackId);
      }),
    reportProgress: (progress, appliesToTrackId) =>
      Effect.sync(() => authority.reportProgress(progress, appliesToTrackId)),
    reportAudioError: (message, appliesToTrackId) =>
      afterCommand(() => {
        authority.reportAudioError(message, appliesToTrackId);
      }),
    trackEnded: (appliesToTrackId) =>
      afterCommand(() => authority.trackEnded(appliesToTrackId)),
    subscribe: (listener) => Effect.sync(() => authority.subscribe(listener)),
  };
}

/** Build a Player layer from a configurable authority. */
export function PlayerLayerFromAuthority(
  authority: PlayerAuthority,
): Layer.Layer<Player> {
  return Layer.sync(Player)(() => makeShape(authority));
}

/** Build a Player layer from a configurable behavior. */
export const PlayerLayerFromBehavior = PlayerLayerFromAuthority;

/**
 * Live Player layer wrapping the singleton-backed authority adapter.
 * Production RPC handlers consume this layer; Android media bridge can use
 * the same adapter so both paths share state through a named seam.
 */
export const PlayerLayerLive: Layer.Layer<Player> = Layer.sync(Player)(() =>
  makeShape(getLivePlayerAuthority()),
);
