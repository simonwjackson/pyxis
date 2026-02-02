import * as Queue from "./queue.js";
import { schedulePlayerSave, loadPlayerState } from "./persistence.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback");

export type PlayerStatus = "playing" | "paused" | "stopped";

export type PlayerState = {
	readonly status: PlayerStatus;
	readonly currentTrack: Queue.QueueTrack | null;
	readonly nextTrack: Queue.QueueTrack | null;
	readonly progress: number;
	readonly duration: number;
	readonly volume: number;
	readonly updatedAt: number;
	readonly queueContext: Queue.QueueContext;
};

type PlayerListener = (state: PlayerState) => void;

// Server-side player state (singleton)
let status: PlayerStatus = "stopped";
let progress = 0;
let duration = 0;
let volume = 100;
let updatedAt = Date.now();

const listeners = new Set<PlayerListener>();

function notify(): void {
	const state = getState();
	const trackId = state.currentTrack?.id ?? "none";
	const nextId = state.nextTrack?.id ?? "none";
	log.log(`[player] notify status=${state.status} track=${trackId} next=${nextId} listeners=${listeners.size}`);
	schedulePlayerSave({
		status: state.status,
		progress: state.progress,
		duration: state.duration,
		volume: state.volume,
		updatedAt: state.updatedAt,
	});
	for (const listener of listeners) {
		listener(state);
	}
}

export function getState(): PlayerState {
	return {
		status,
		currentTrack: Queue.currentTrack() ?? null,
		nextTrack: Queue.nextTrack() ?? null,
		progress: getProgress(),
		duration,
		volume,
		updatedAt,
		queueContext: Queue.getState().context,
	};
}

/**
 * Calculate current progress.
 * When playing, derive from elapsed time since last update.
 * When paused/stopped, return stored progress.
 */
function getProgress(): number {
	if (status === "playing") {
		const elapsed = (Date.now() - updatedAt) / 1000;
		return Math.min(progress + elapsed, duration || Number.MAX_SAFE_INTEGER);
	}
	return progress;
}

export function subscribe(listener: PlayerListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function play(tracks?: readonly Queue.QueueTrack[], context?: Queue.QueueContext, startIndex?: number): void {
	log.log(`[player] play() called tracks=${tracks?.length ?? "none"} startIndex=${startIndex ?? "none"}`);
	if (tracks && context) {
		Queue.setQueue(tracks, context, startIndex);
	}

	const track = Queue.currentTrack();
	if (!track) {
		status = "stopped";
		progress = 0;
		duration = 0;
		updatedAt = Date.now();
		notify();
		return;
	}

	status = "playing";
	progress = 0;
	duration = track.duration ?? 0;
	updatedAt = Date.now();
	notify();
}

export function pause(): void {
	log.log(`[player] pause() called current=${status}`);
	if (status !== "playing") return;
	progress = getProgress();
	status = "paused";
	updatedAt = Date.now();
	notify();
}

export function resume(): void {
	log.log(`[player] resume() called current=${status}`);
	if (status !== "paused") return;
	status = "playing";
	updatedAt = Date.now();
	notify();
}

export function stop(): void {
	progress = 0;
	duration = 0;
	status = "stopped";
	updatedAt = Date.now();
	Queue.clear();
	notify();
}

export function skip(): Queue.QueueTrack | undefined {
	log.log(`[player] skip() called currentIndex=${Queue.getState().currentIndex} queueLen=${Queue.getState().items.length}`);
	const nextTrack = Queue.next();
	if (!nextTrack) {
		status = "stopped";
		progress = 0;
		duration = 0;
		updatedAt = Date.now();
		notify();
		return undefined;
	}

	status = "playing";
	progress = 0;
	duration = nextTrack.duration ?? 0;
	updatedAt = Date.now();
	notify();
	return nextTrack;
}

export function previousTrack(): Queue.QueueTrack | undefined {
	log.log(`[player] previous() called currentIndex=${Queue.getState().currentIndex}`);
	const prev = Queue.previous();
	if (!prev) return undefined;

	status = "playing";
	progress = 0;
	duration = prev.duration ?? 0;
	updatedAt = Date.now();
	notify();
	return prev;
}

export function jumpToIndex(index: number): Queue.QueueTrack | undefined {
	log.log(`[player] jumpTo(${index}) called currentIndex=${Queue.getState().currentIndex}`);
	const track = Queue.jumpTo(index);
	if (!track) return undefined;

	status = "playing";
	progress = 0;
	duration = track.duration ?? 0;
	updatedAt = Date.now();
	notify();
	return track;
}

export function seek(position: number): void {
	progress = Math.max(0, Math.min(position, duration));
	updatedAt = Date.now();
	notify();
}

export function setVolume(level: number): void {
	volume = Math.max(0, Math.min(100, level));
	notify();
}

export function setDuration(d: number): void {
	duration = d;
	updatedAt = Date.now();
	notify();
}

export function reportProgress(p: number): void {
	progress = p;
	updatedAt = Date.now();
	// No notify — this is a silent update from client to keep server in sync
}

/**
 * Called when a track naturally ends on the client.
 * Advances to next track or stops.
 */
export function trackEnded(): Queue.QueueTrack | undefined {
	return skip();
}

/**
 * Restore player + queue state from DB.
 * Always restores to "paused" since there's no audio element on the server.
 */
export async function restoreFromDb(): Promise<boolean> {
	const queueRestored = await Queue.restoreFromDb();
	if (!queueRestored) return false;

	const saved = await loadPlayerState();
	if (saved) {
		// Restore to paused — server can't play audio
		status = "paused";
		progress = saved.progress;
		duration = saved.duration;
		volume = saved.volume;
		updatedAt = Date.now();
	} else {
		// Queue was restored but no player state — set defaults
		const track = Queue.currentTrack();
		status = "paused";
		progress = 0;
		duration = track?.duration ?? 0;
		volume = 100;
		updatedAt = Date.now();
	}

	notify();
	return true;
}
