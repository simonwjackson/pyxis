/**
 * @module server/rpc/services/queue
 * Effect service wrapping the singleton {@link QueueService}. The live
 * layer delegates every method to the existing module-level functions so
 * the player singleton, persistence, and auto-fetch share one queue
 * authority.
 */

import { Context, Effect, Layer } from "effect";
import type {
	QueueContext,
	QueueState,
	QueueTrack,
} from "../../services/queue.js";
import * as QueueSingleton from "../../services/queue.js";

export type QueueStateListener = (state: QueueState) => void;

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

/** Behavior knobs for an in-memory Queue layer used by tests. */
export type QueueBehavior = {
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

function makeShape(behavior: QueueBehavior): QueueShape {
	const afterCommand = (mutate: () => void) =>
		Effect.sync(() => {
			mutate();
			return behavior.getState();
		});

	return {
		getState: Effect.sync(() => behavior.getState()),
		setQueue: (tracks, context, startIndex) =>
			afterCommand(() => behavior.setQueue(tracks, context, startIndex)),
		addTracks: (tracks, insertNext) =>
			afterCommand(() => behavior.addTracks(tracks, insertNext)),
		removeTrack: (index) => afterCommand(() => behavior.removeTrack(index)),
		clear: afterCommand(() => behavior.clear()),
		jumpTo: (index) => afterCommand(() => behavior.jumpTo(index)),
		shuffle: afterCommand(() => behavior.shuffle()),
		subscribe: (listener) => Effect.sync(() => behavior.subscribe(listener)),
	};
}

/** Build a Queue layer from a configurable behavior. */
export function QueueLayerFromBehavior(
	behavior: QueueBehavior,
): Layer.Layer<Queue> {
	return Layer.sync(Queue)(() => makeShape(behavior));
}

/**
 * Live Queue layer wrapping the module-level singleton. Production RPC
 * handlers consume this layer; auto-fetch and persistence continue to call
 * the singleton directly so all paths share state.
 */
export const QueueLayerLive: Layer.Layer<Queue> = Layer.sync(Queue)(() =>
	makeShape({
		getState: () => QueueSingleton.getState(),
		setQueue: (tracks, context, startIndex) =>
			QueueSingleton.setQueue(tracks, context, startIndex),
		addTracks: (tracks, insertNext) =>
			QueueSingleton.addTracks(tracks, insertNext),
		removeTrack: (index) => QueueSingleton.removeTrack(index),
		clear: () => QueueSingleton.clear(),
		jumpTo: (index) => {
			QueueSingleton.jumpTo(index);
		},
		shuffle: () => QueueSingleton.shuffle(),
		subscribe: (listener) => QueueSingleton.subscribe(listener),
	}),
);
