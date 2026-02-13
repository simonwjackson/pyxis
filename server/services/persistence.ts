/**
 * @module persistence
 * Database persistence layer for player and queue state.
 * Provides debounced saves to avoid excessive database writes during rapid state changes.
 * Uses ProseQL with YAML/JSONL persistence.
 */

import { getDb, type QueueItem } from "../../src/db/index.js";
import type { QueueTrack, QueueContext, QueueState } from "./queue.js";
import type { PlayerStatus } from "./player.js";
import type { SourceType } from "../../src/sources/types.js";

// Debounce state: separate timers for player and queue
let playerTimer: ReturnType<typeof setTimeout> | undefined;
let queueTimer: ReturnType<typeof setTimeout> | undefined;

/** Debounce delay in milliseconds for database writes */
const DEBOUNCE_MS = 1000;

// --- Player persistence ---

/**
 * Player state fields that are persisted to the database.
 * Excludes track references which are managed by queue persistence.
 */
type PersistedPlayerState = {
	/** Current playback status */
	readonly status: PlayerStatus;
	/** Playback position in seconds */
	readonly progress: number;
	/** Track duration in seconds */
	readonly duration: number;
	/** Volume level from 0-100 */
	readonly volume: number;
	/** Unix timestamp (ms) of last update */
	readonly updatedAt: number;
};

/**
 * Schedules a debounced save of player state to the database.
 * Cancels any pending save and schedules a new one after DEBOUNCE_MS.
 * This prevents excessive database writes during rapid state changes (e.g., seeking).
 *
 * @param state - Player state to persist
 */
export function schedulePlayerSave(state: PersistedPlayerState): void {
	if (playerTimer) clearTimeout(playerTimer);
	playerTimer = setTimeout(() => {
		void savePlayerState(state);
	}, DEBOUNCE_MS);
}

async function savePlayerState(state: PersistedPlayerState): Promise<void> {
	try {
		const db = await getDb();
		await db.playerState.upsert({
			where: { id: "current" },
			create: {
				id: "current",
				status: state.status,
				progress: state.progress,
				duration: state.duration,
				volume: state.volume,
			},
			update: {
				status: state.status,
				progress: state.progress,
				duration: state.duration,
				volume: state.volume,
			},
		}).runPromise;
	} catch {
		// Silently ignore DB errors — in-memory state is authoritative
	}
}

/**
 * Loads the persisted player state from the database.
 * Used on server startup to restore playback position and settings.
 *
 * @returns The persisted player state, or undefined if not found or on error
 */
export async function loadPlayerState(): Promise<PersistedPlayerState | undefined> {
	try {
		const db = await getDb();
		const row = await db.playerState.findById("current").runPromise;
		if (!row) return undefined;
		return {
			status: row.status as PlayerStatus,
			progress: row.progress,
			duration: row.duration,
			volume: row.volume,
			updatedAt: row.updatedAt,
		};
	} catch {
		return undefined;
	}
}

// --- Queue persistence ---

/**
 * Converts a QueueContext to database row format.
 *
 * @param ctx - Queue context describing playback origin
 * @returns Object with contextType string and optional contextId
 */
function contextToRow(ctx: QueueContext): { contextType: string; contextId?: string } {
	switch (ctx.type) {
		case "radio":
			return { contextType: "radio", contextId: ctx.seedId };
		case "album":
			return { contextType: "album", contextId: ctx.albumId };
		case "playlist":
			return { contextType: "playlist", contextId: ctx.playlistId };
		case "manual":
			return { contextType: "manual" }; // Omit contextId for manual
	}
}

/**
 * Converts database row format back to a QueueContext.
 *
 * @param contextType - Context type string from database
 * @param contextId - Context ID from database (empty string for manual)
 * @returns Reconstructed QueueContext union type
 */
function rowToContext(contextType: string, contextId: string | undefined): QueueContext {
	switch (contextType) {
		case "radio":
			return { type: "radio", seedId: contextId ?? "" };
		case "album":
			return { type: "album", albumId: contextId ?? "" };
		case "playlist":
			return { type: "playlist", playlistId: contextId ?? "" };
		default:
			return { type: "manual" };
	}
}

/**
 * Converts a QueueTrack to a QueueItem for ProseQL storage.
 */
function trackToItem(track: QueueTrack): QueueItem {
	return {
		opaqueTrackId: track.id,
		source: track.source,
		title: track.title,
		artist: track.artist,
		album: track.album,
		...(track.duration != null ? { duration: track.duration } : {}),
		...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
	};
}

/**
 * Converts a QueueItem from ProseQL to a QueueTrack.
 */
function itemToTrack(item: QueueItem): QueueTrack {
	return {
		id: item.opaqueTrackId,
		title: item.title,
		artist: item.artist,
		album: item.album,
		duration: item.duration ?? null,
		artworkUrl: item.artworkUrl ?? null,
		source: item.source as SourceType,
	};
}

/**
 * Schedules a debounced save of queue state to the database.
 * Cancels any pending save and schedules a new one after DEBOUNCE_MS.
 * This prevents excessive database writes during rapid queue modifications.
 *
 * @param state - Queue state to persist (items, currentIndex, context)
 */
export function scheduleQueueSave(state: QueueState): void {
	if (queueTimer) clearTimeout(queueTimer);
	queueTimer = setTimeout(() => {
		void saveQueueState(state);
	}, DEBOUNCE_MS);
}

async function saveQueueState(state: QueueState): Promise<void> {
	try {
		const db = await getDb();
		const ctx = contextToRow(state.context);
		const items = state.items.map(trackToItem);
		// ProseQL stores the queue as a single document with embedded items
		await db.queueState.upsert({
			where: { id: "current" },
			create: {
				id: "current",
				currentIndex: state.currentIndex,
				contextType: ctx.contextType,
				items,
				...(ctx.contextId !== undefined ? { contextId: ctx.contextId } : {}),
			},
			update: {
				currentIndex: state.currentIndex,
				contextType: ctx.contextType,
				items,
				...(ctx.contextId !== undefined ? { contextId: ctx.contextId } : {}),
			},
		}).runPromise;
	} catch {
		// Silently ignore DB errors — in-memory state is authoritative
	}
}

/**
 * Loads the persisted queue state from the database.
 * Reconstructs the full queue including all tracks, current position, and context.
 * Used on server startup to restore the playback queue.
 *
 * @returns The persisted queue state, or undefined if not found or on error
 */
export async function loadQueueState(): Promise<QueueState | undefined> {
	try {
		const db = await getDb();
		const stateRow = await db.queueState.findById("current").runPromise;
		if (!stateRow) return undefined;

		const items: QueueTrack[] = stateRow.items.map(itemToTrack);

		return {
			items,
			currentIndex: stateRow.currentIndex,
			context: rowToContext(stateRow.contextType, stateRow.contextId),
		};
	} catch {
		return undefined;
	}
}
