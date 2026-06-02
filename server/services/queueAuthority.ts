/**
 * @module queueAuthority
 * Shared queue authority adapter for Effect RPC and adjacent playback services.
 *
 * The live adapter intentionally delegates to `server/services/queue.ts`, which
 * remains the current singleton state owner while the Effect service layer is
 * deepened around an explicit authority contract.
 */

import type {
  QueueContext,
  QueueState,
  QueueTrack,
} from "./queue.js";
import * as QueueSingleton from "./queue.js";

export type QueueStateListener = (state: QueueState) => void;

export type QueueAuthority = {
  readonly getState: () => QueueState;
  readonly setQueue: (
    tracks: readonly QueueTrack[],
    context: QueueContext,
    startIndex?: number,
  ) => void;
  readonly addTracks: (
    tracks: readonly QueueTrack[],
    insertNext?: boolean,
  ) => void;
  readonly removeTrack: (index: number) => void;
  readonly clear: () => void;
  readonly jumpTo: (index: number) => void;
  readonly shuffle: () => void;
  readonly subscribe: (listener: QueueStateListener) => () => void;
};

const singletonQueueAuthority: QueueAuthority = {
  getState: () => QueueSingleton.getState(),
  setQueue: (tracks, context, startIndex) =>
    QueueSingleton.setQueue(tracks, context, startIndex),
  addTracks: (tracks, insertNext) =>
    QueueSingleton.addTracks(tracks, insertNext),
  removeTrack: (index) => QueueSingleton.removeTrack(index),
  clear: () => QueueSingleton.clear(),
  jumpTo: (index) => QueueSingleton.jumpTo(index),
  shuffle: () => QueueSingleton.shuffle(),
  subscribe: (listener) => QueueSingleton.subscribe(listener),
};

export function getLiveQueueAuthority(): QueueAuthority {
  return singletonQueueAuthority;
}
