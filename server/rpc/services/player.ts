/**
 * @module server/rpc/services/player
 * Effect service wrapping the singleton {@link PlayerService}. The live
 * layer delegates every method to the existing module-level functions so
 * web RPC, Android media bridge, and listen-log side effects continue to
 * observe one player state owner.
 *
 * The U3 surface intentionally exposes a callback-style `subscribe` rather
 * than an Effect Stream; the streaming RPC contract is built on top of this
 * subscribe in U5 once the player handler is migrated.
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
	readonly setDuration: (duration: number) => Effect.Effect<PlayerState>;
	readonly reportProgress: (progress: number) => Effect.Effect<void>;
	readonly reportAudioError: (message: string) => Effect.Effect<void>;
	readonly trackEnded: Effect.Effect<PlayerState>;
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
	readonly setDuration: (duration: number) => void;
	readonly reportProgress: (progress: number) => void;
	readonly reportAudioError: (message: string) => void;
	readonly trackEnded: () => void;
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
		setDuration: (duration) =>
			afterCommand(() => behavior.setDuration(duration)),
		reportProgress: (progress) =>
			Effect.sync(() => behavior.reportProgress(progress)),
		reportAudioError: (message) =>
			Effect.sync(() => behavior.reportAudioError(message)),
		trackEnded: afterCommand(() => behavior.trackEnded()),
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
		setDuration: (duration) => PlayerSingleton.setDuration(duration),
		reportProgress: (progress) => PlayerSingleton.reportProgress(progress),
		reportAudioError: (message) => PlayerSingleton.reportAudioError(message),
		trackEnded: () => {
			PlayerSingleton.trackEnded();
		},
		subscribe: (listener) => PlayerSingleton.subscribe(listener),
	}),
);
