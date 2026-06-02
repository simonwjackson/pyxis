/**
 * @module server/rpc/services/queue
 * Effect service for the shared queue authority. The live layer delegates
 * through the singleton-backed authority adapter so the player singleton,
 * persistence, auto-fetch, and RPC observe one queue authority without every
 * runtime importing the singleton directly.
 */

import { Context, Effect, Layer } from "effect";
import type {
  QueueContext,
  QueueState,
  QueueTrack,
} from "../../services/queue.js";
import {
  getLiveQueueAuthority,
  type QueueAuthority,
  type QueueStateListener,
} from "../../services/queueAuthority.js";

/**
 * Effect surface for the queue. As with {@link PlayerShape}, U3 keeps the
 * subscription as a callback so U5 can build an Effect Stream on top
 * without coupling the wire shape to the singleton.
 */
export type QueueShape = {
  readonly getState: Effect.Effect<QueueState>;
  readonly setQueue: (
    tracks: readonly QueueTrack[],
    context: QueueContext,
    startIndex?: number,
  ) => Effect.Effect<QueueState>;
  readonly addTracks: (
    tracks: readonly QueueTrack[],
    insertNext?: boolean,
  ) => Effect.Effect<QueueState>;
  readonly removeTrack: (index: number) => Effect.Effect<QueueState>;
  readonly clear: Effect.Effect<QueueState>;
  readonly jumpTo: (index: number) => Effect.Effect<QueueState>;
  readonly shuffle: Effect.Effect<QueueState>;
  readonly subscribe: (
    listener: QueueStateListener,
  ) => Effect.Effect<() => void>;
};

/** Effect Context.Service tag for {@link QueueShape}. */
export class Queue extends Context.Service<Queue, QueueShape>()(
  "Pyxis/Queue",
) {}

function makeShape(authority: QueueAuthority): QueueShape {
  const afterCommand = (mutate: () => void) =>
    Effect.sync(() => {
      mutate();
      return authority.getState();
    });

  return {
    getState: Effect.sync(() => authority.getState()),
    setQueue: (tracks, context, startIndex) =>
      afterCommand(() => authority.setQueue(tracks, context, startIndex)),
    addTracks: (tracks, insertNext) =>
      afterCommand(() => authority.addTracks(tracks, insertNext)),
    removeTrack: (index) => afterCommand(() => authority.removeTrack(index)),
    clear: afterCommand(() => authority.clear()),
    jumpTo: (index) => afterCommand(() => authority.jumpTo(index)),
    shuffle: afterCommand(() => authority.shuffle()),
    subscribe: (listener) => Effect.sync(() => authority.subscribe(listener)),
  };
}

/** Build a Queue layer from a configurable authority. */
export function QueueLayerFromAuthority(
  authority: QueueAuthority,
): Layer.Layer<Queue> {
  return Layer.sync(Queue)(() => makeShape(authority));
}

/** Build a Queue layer from a configurable behavior. */
export const QueueLayerFromBehavior = QueueLayerFromAuthority;

/**
 * Live Queue layer wrapping the singleton-backed authority adapter.
 */
export const QueueLayerLive: Layer.Layer<Queue> = Layer.sync(Queue)(() =>
  makeShape(getLiveQueueAuthority()),
);
