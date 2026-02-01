import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";
import type { QueueTrack, QueueContext, QueueState } from "./queue.js";
import type { PlayerStatus } from "./player.js";
import type { SourceType } from "../../src/sources/types.js";

// Debounce state: separate timers for player and queue
let playerTimer: ReturnType<typeof setTimeout> | undefined;
let queueTimer: ReturnType<typeof setTimeout> | undefined;
const DEBOUNCE_MS = 1000;

// --- Player persistence ---

type PersistedPlayerState = {
	readonly status: PlayerStatus;
	readonly progress: number;
	readonly duration: number;
	readonly volume: number;
	readonly updatedAt: number;
};

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
