/**
 * @module persistence
 * Database persistence layer for player and queue state.
 * Provides debounced saves to avoid excessive database writes during rapid state changes.
 * Uses PGlite (in-browser Postgres) with Drizzle ORM.
 */

import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";
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
		await db
			.insert(schema.playerState)
			.values({
				id: "current",
				status: state.status,
				progress: state.progress,
				duration: state.duration,
				volume: state.volume,
				updatedAt: state.updatedAt,
			})
			.onConflictDoUpdate({
				target: schema.playerState.id,
				set: {
					status: state.status,
					progress: state.progress,
					duration: state.duration,
					volume: state.volume,
					updatedAt: state.updatedAt,
				},
			});
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
		const rows = await db
			.select()
			.from(schema.playerState)
			.where(eq(schema.playerState.id, "current"))
			.limit(1);
		const row = rows[0];
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
 * @returns Object with contextType string and contextId (null for manual)
 */
function contextToRow(ctx: QueueContext): { contextType: string; contextId: string | null } {
	switch (ctx.type) {
		case "radio":
			return { contextType: "radio", contextId: ctx.seedId };
		case "album":
			return { contextType: "album", contextId: ctx.albumId };
		case "playlist":
			return { contextType: "playlist", contextId: ctx.playlistId };
		case "manual":
			return { contextType: "manual", contextId: null };
	}
}

/**
 * Converts database row format back to a QueueContext.
 *
 * @param contextType - Context type string from database
 * @param contextId - Context ID from database (null for manual)
 * @returns Reconstructed QueueContext union type
 */
function rowToContext(contextType: string, contextId: string | null): QueueContext {
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
		// Delete old items and insert new ones in a single batch
		await db.delete(schema.queueItems);
		if (state.items.length > 0) {
			await db.insert(schema.queueItems).values(
				state.items.map((track, index) => ({
					id: `qi-${String(index)}`,
					queueIndex: index,
					opaqueTrackId: track.id,
					source: track.source,
					title: track.title,
					artist: track.artist,
					album: track.album,
					duration: track.duration,
					artworkUrl: track.artworkUrl,
				})),
			);
		}

		const ctx = contextToRow(state.context);
		await db
			.insert(schema.queueState)
			.values({
				id: "current",
				currentIndex: state.currentIndex,
				contextType: ctx.contextType,
				contextId: ctx.contextId,
			})
			.onConflictDoUpdate({
				target: schema.queueState.id,
				set: {
					currentIndex: state.currentIndex,
					contextType: ctx.contextType,
					contextId: ctx.contextId,
				},
			});
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
		const stateRows = await db
			.select()
			.from(schema.queueState)
			.where(eq(schema.queueState.id, "current"))
			.limit(1);
		const stateRow = stateRows[0];
		if (!stateRow) return undefined;

		const itemRows = await db
			.select()
			.from(schema.queueItems)
			.orderBy(schema.queueItems.queueIndex);

		const items: QueueTrack[] = itemRows.map((row) => ({
			id: row.opaqueTrackId,
			title: row.title,
			artist: row.artist,
			album: row.album,
			duration: row.duration,
			artworkUrl: row.artworkUrl,
			source: row.source as SourceType,
		}));

		return {
			items,
			currentIndex: stateRow.currentIndex,
			context: rowToContext(stateRow.contextType, stateRow.contextId),
		};
	} catch {
		return undefined;
	}
}
