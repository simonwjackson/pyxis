/**
 * @module queue
 * Server-side singleton playback queue management.
 * Maintains the ordered list of tracks to play, supports multiple playback contexts
 * (radio, album, playlist, manual), and provides auto-fetch for radio stations.
 */

import type { SourceType } from "../../src/sources/types.js";
import { scheduleQueueSave, loadQueueState } from "./persistence.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "queue" });

/**
 * Track metadata stored in the playback queue.
 * Contains display information and the opaque track ID for streaming.
 */
export type QueueTrack = {
	/** Opaque encoded track ID in format "source:trackId" (e.g., "pandora:abc123") */
	readonly id: string;
	/** Track title for display */
	readonly title: string;
	/** Artist name for display */
	readonly artist: string;
	/** Album name for display */
	readonly album: string;
	/** Track duration in seconds, or null if unknown */
	readonly duration: number | null;
	/** URL for album/track artwork, or null if unavailable */
	readonly artworkUrl: string | null;
	/** Source backend that provides this track */
	readonly source: SourceType;
};

/**
 * Describes the context/origin of the current playback queue.
 * Used for auto-fetching more tracks and displaying context information.
 *
 * - `radio`: Playing a Pandora radio station (auto-fetches more tracks)
 * - `album`: Playing an album in order
 * - `playlist`: Playing a saved playlist
 * - `manual`: User-constructed queue with no auto-fetch
 */
export type QueueContext =
	| { readonly type: "radio"; readonly seedId: string }
	| { readonly type: "album"; readonly albumId: string }
	| { readonly type: "playlist"; readonly playlistId: string }
	| { readonly type: "manual" };

/**
 * Complete queue state snapshot.
 * Contains all tracks, current position, and playback context.
 */
export type QueueState = {
	/** Ordered list of tracks in the queue */
	readonly items: readonly QueueTrack[];
	/** Zero-based index of the currently playing track */
	readonly currentIndex: number;
	/** Context describing the queue origin */
	readonly context: QueueContext;
};

/**
 * Callback function type for queue state change subscriptions.
 */
type QueueListener = (state: QueueState) => void;

/**
 * Handler function for auto-fetching more tracks when the queue runs low.
 * Receives the current context and should return additional tracks to append.
 */
type AutoFetchHandler = (context: QueueContext) => Promise<readonly QueueTrack[]>;

// In-memory queue state (singleton — single-user server)
let items: QueueTrack[] = [];
let currentIndex = 0;
let context: QueueContext = { type: "manual" };
const listeners = new Set<QueueListener>();
let autoFetchHandler: AutoFetchHandler | undefined;
let autoFetchInFlight = false;
const AUTO_FETCH_THRESHOLD = 2;

/**
 * Registers a handler to auto-fetch more tracks when the queue runs low.
 * Only triggered for radio context when fewer than 2 tracks remain after current.
 *
 * @param handler - Async function that fetches additional tracks for the given context
 *
 * @example
 * ```ts
 * setAutoFetchHandler(async (ctx) => {
 *   if (ctx.type === "radio") {
 *     return await fetchMoreRadioTracks(ctx.seedId);
 *   }
 *   return [];
 * });
 * ```
 */
export function setAutoFetchHandler(handler: AutoFetchHandler): void {
	autoFetchHandler = handler;
}

function notify(): void {
	const state = getState();
	log.info({ index: state.currentIndex, len: state.items.length, listeners: listeners.size }, "notify");
	scheduleQueueSave(state);
	for (const listener of listeners) {
		listener(state);
	}
}

function maybeAutoFetch(): void {
	if (!autoFetchHandler) return;
	if (autoFetchInFlight) return;
	if (context.type !== "radio") return;
	const remaining = items.length - currentIndex - 1;
	if (remaining > AUTO_FETCH_THRESHOLD) return;

	log.debug({ remaining, contextType: context.type, seedId: context.type === "radio" ? context.seedId : undefined }, "auto-fetch triggered");
	autoFetchInFlight = true;
	const handler = autoFetchHandler;
	const ctx = context;
	handler(ctx)
		.then((tracks) => {
			if (tracks.length > 0) {
				log.info({ appended: tracks.length, queueSize: items.length + tracks.length }, "auto-fetch succeeded");
				appendTracks(tracks);
			}
		})
		.catch((err: unknown) => {
			log.warn({ err }, "auto-fetch failed");
		})
		.finally(() => {
			autoFetchInFlight = false;
		});
}

/**
 * Returns the current queue state snapshot.
 *
 * @returns Complete queue state including all tracks, current index, and context
 */
export function getState(): QueueState {
	return { items, currentIndex, context };
}

/**
 * Subscribes to queue state changes.
 * The listener is called on each state change with the full state snapshot.
 *
 * @param listener - Callback function invoked on each state change
 * @returns Unsubscribe function to remove the listener
 *
 * @example
 * ```ts
 * const unsubscribe = subscribe((state) => {
 *   console.log(`Queue has ${state.items.length} tracks`);
 * });
 * // Later: unsubscribe();
 * ```
 */
export function subscribe(listener: QueueListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Replaces the entire queue with a new set of tracks and context.
 * Triggers auto-fetch if the new queue is a radio context with few tracks.
 *
 * @param tracks - Array of tracks to set as the new queue
 * @param newContext - Context describing the queue origin
 * @param startIndex - Index of the track to start playing (default: 0)
 *
 * @example
 * ```ts
 * // Start playing an album from track 3
 * setQueue(albumTracks, { type: "album", albumId: "xyz" }, 2);
 * ```
 */
export function setQueue(
	tracks: readonly QueueTrack[],
	newContext: QueueContext,
	startIndex = 0,
): void {
	log.info({ tracks: tracks.length, context: newContext.type, startIndex }, "setQueue()");
	items = [...tracks];
	currentIndex = startIndex;
	context = newContext;
	notify();
	maybeAutoFetch();
}

/**
 * Adds tracks to the queue either immediately after the current track or at the end.
 *
 * @param tracks - Array of tracks to add
 * @param insertNext - If true, insert after current track; if false, append to end (default: false)
 *
 * @example
 * ```ts
 * // Add to end of queue
 * addTracks(moreTracks);
 *
 * // Play these next
 * addTracks(priorityTracks, true);
 * ```
 */
export function addTracks(
	tracks: readonly QueueTrack[],
	insertNext = false,
): void {
	if (insertNext) {
		items.splice(currentIndex + 1, 0, ...tracks);
	} else {
		items.push(...tracks);
	}
	notify();
}

/**
 * Removes a track from the queue by index.
 * Adjusts currentIndex as needed to maintain correct position.
 * No-op if index is out of bounds.
 *
 * @param index - Zero-based index of the track to remove
 */
export function removeTrack(index: number): void {
	if (index < 0 || index >= items.length) return;
	items.splice(index, 1);
	if (index < currentIndex) {
		currentIndex--;
	} else if (index === currentIndex && currentIndex >= items.length) {
		currentIndex = Math.max(0, items.length - 1);
	}
	notify();
}

/**
 * Jumps to a specific track in the queue by index.
 * Triggers auto-fetch if jumping near the end of a radio queue.
 *
 * @param index - Zero-based index of the track to jump to
 * @returns The track at the specified index, or undefined if index is out of bounds
 */
export function jumpTo(index: number): QueueTrack | undefined {
	log.info({ index, from: currentIndex }, "jumpTo()");
	if (index < 0 || index >= items.length) return undefined;
	currentIndex = index;
	notify();
	maybeAutoFetch();
	return items[currentIndex];
}

/**
 * Advances to the next track in the queue.
 * Triggers auto-fetch if near the end of a radio queue.
 *
 * @returns The next track, or undefined if already at the end
 */
export function next(): QueueTrack | undefined {
	log.info({ from: currentIndex, to: currentIndex + 1 }, "next()");
	if (currentIndex + 1 >= items.length) return undefined;
	currentIndex++;
	notify();
	maybeAutoFetch();
	return items[currentIndex];
}

/**
 * Goes back to the previous track in the queue.
 *
 * @returns The previous track, or undefined if already at the start
 */
export function previous(): QueueTrack | undefined {
	log.info({ from: currentIndex, to: currentIndex - 1 }, "previous()");
	if (currentIndex <= 0) return undefined;
	currentIndex--;
	notify();
	return items[currentIndex];
}

/**
 * Returns the currently playing track.
 *
 * @returns The current track, or undefined if the queue is empty
 */
export function currentTrack(): QueueTrack | undefined {
	return items[currentIndex];
}

/**
 * Returns the next track in the queue without advancing.
 * Useful for prefetching/preloading the next track.
 *
 * @returns The next track, or undefined if at the end of the queue
 */
export function nextTrack(): QueueTrack | undefined {
	return items[currentIndex + 1];
}

/**
 * Clears all tracks from the queue and resets to manual context.
 */
export function clear(): void {
	log.info("clear()");
	items = [];
	currentIndex = 0;
	context = { type: "manual" };
	notify();
}

/**
 * Shuffles all tracks except the currently playing track.
 * The current track becomes index 0, and all other tracks are randomized after it.
 * Uses Fisher-Yates shuffle algorithm.
 * No-op if the queue has 0 or 1 tracks.
 */
export function shuffle(): void {
	if (items.length <= 1) return;
	const current = items[currentIndex];
	const before = items.slice(0, currentIndex);
	const after = items.slice(currentIndex + 1);
	const rest = [...before, ...after];

	for (let i = rest.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[rest[i], rest[j]] = [rest[j]!, rest[i]!];
	}

	if (current) {
		items = [current, ...rest];
		currentIndex = 0;
	} else {
		items = rest;
		currentIndex = 0;
	}
	notify();
}

/**
 * Appends tracks to the end of the queue.
 * Typically used by auto-fetch to add more tracks to a radio station.
 *
 * @param tracks - Array of tracks to append
 */
export function appendTracks(tracks: readonly QueueTrack[]): void {
	items.push(...tracks);
	notify();
}

/**
 * Restores queue state from the database on server startup.
 * Does not trigger notifications; the player module handles that after both are restored.
 *
 * @returns True if state was successfully restored with at least one track, false otherwise
 */
export async function restoreFromDb(): Promise<boolean> {
	const saved = await loadQueueState();
	if (!saved || saved.items.length === 0) return false;
	items = [...saved.items];
	currentIndex = saved.currentIndex;
	context = saved.context;
	// Don't notify — player restore handles the notification
	return true;
}
