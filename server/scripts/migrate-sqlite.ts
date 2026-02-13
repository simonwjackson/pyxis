#!/usr/bin/env bun
/**
 * @module migrate-sqlite
 * One-time migration script to migrate data from SQLite (pyxis.db) to ProseQL YAML/JSONL files.
 *
 * This script:
 * 1. Reads all 8 SQLite tables using bun:sqlite directly (not Drizzle)
 * 2. Writes data directly to YAML/JSONL files (bypassing ProseQL API to preserve timestamps)
 * 3. Merges queue_items + queue_state into a single queueState document with embedded items
 * 4. Reports counts per collection
 *
 * Usage: bun server/scripts/migrate-sqlite.ts
 *
 * The script is idempotent: if YAML files already exist, it will skip migration.
 * After successful migration, the original SQLite file is renamed to .bak (unless .bak already exists).
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import YAML from "yaml";
import type { Album, AlbumSourceRef, AlbumTrack, Playlist, PlayerState, QueueState, QueueItem, ListenLog } from "../../src/db/config.js";

const paths = envPaths("pyxis", { suffix: "" });
const DATA_DIR = join(paths.data, "db");
const SQLITE_PATH = join(DATA_DIR, "pyxis.db");
const SQLITE_BAK_PATH = join(DATA_DIR, "pyxis.db.bak");

// ProseQL YAML/JSONL file paths (must match config.ts)
const YAML_FILES = {
	albums: join(DATA_DIR, "albums.yaml"),
	albumSourceRefs: join(DATA_DIR, "album-source-refs.yaml"),
	albumTracks: join(DATA_DIR, "album-tracks.yaml"),
	playlists: join(DATA_DIR, "playlists.yaml"),
	playerState: join(DATA_DIR, "player-state.yaml"),
	queueState: join(DATA_DIR, "queue-state.yaml"),
};

// Listen log path (written separately, not part of migration guard)
const LISTEN_LOG_PATH = join(DATA_DIR, "listen-log.jsonl");

/**
 * Check if any ProseQL data files already exist.
 */
function proseqlDataExists(): boolean {
	return Object.values(YAML_FILES).some((f) => existsSync(f));
}

/**
 * SQLite row types (matching the old Drizzle schema)
 */
interface SqliteAlbum {
	id: string;
	title: string;
	artist: string;
	year: number | null;
	artwork_url: string | null;
	created_at: number; // Unix timestamp (seconds or ms depending on SQLite mode)
}

interface SqliteAlbumSourceRef {
	id: string;
	album_id: string;
	source: string;
	source_id: string;
}

interface SqliteAlbumTrack {
	id: string;
	album_id: string;
	track_index: number;
	title: string;
	artist: string;
	duration: number | null;
	source: string;
	source_track_id: string;
	artwork_url: string | null;
}

interface SqlitePlaylist {
	id: string;
	name: string;
	source: string;
	url: string;
	is_radio: number; // SQLite boolean as 0/1
	seed_track_id: string | null;
	artwork_url: string | null;
	created_at: number;
}

interface SqlitePlayerState {
	id: string;
	status: string;
	progress: number;
	duration: number;
	volume: number;
	updated_at: number;
}

interface SqliteQueueState {
	id: string;
	current_index: number;
	context_type: string;
	context_id: string | null;
}

interface SqliteQueueItem {
	id: string;
	queue_index: number;
	opaque_track_id: string;
	source: string;
	title: string;
	artist: string;
	album: string;
	duration: number | null;
	artwork_url: string | null;
}

interface SqliteListenLog {
	id: string;
	composite_id: string;
	title: string;
	artist: string;
	album: string | null;
	source: string;
	listened_at: number;
}

/**
 * Convert SQLite timestamp to milliseconds.
 * SQLite with Drizzle's "timestamp" mode stores seconds, but we need ms for ProseQL.
 */
function toMs(timestamp: number): number {
	// If timestamp is in seconds (< year 2100 in seconds = ~4.1 billion), convert to ms
	// Otherwise it's already in ms
	if (timestamp < 4102444800) {
		return timestamp * 1000;
	}
	return timestamp;
}

/**
 * Write a collection to a YAML file.
 * ProseQL stores collections as an object keyed by entity ID.
 */
function writeYamlCollection<T extends { id: string }>(filePath: string, entities: T[]): void {
	const obj: Record<string, T> = {};
	for (const entity of entities) {
		obj[entity.id] = entity;
	}
	const content = YAML.stringify(obj, { lineWidth: 0 });
	writeFileSync(filePath, content, "utf-8");
}

/**
 * Append entries to a JSONL file.
 */
function appendJsonl<T>(filePath: string, entries: T[]): void {
	const content = entries.map((e) => JSON.stringify(e)).join("\n");
	if (content) {
		appendFileSync(filePath, content + "\n", "utf-8");
	}
}

/**
 * Main migration function.
 */
export async function migrateFromSqlite(): Promise<{
	migrated: boolean;
	counts: Record<string, number>;
}> {
	// Check if SQLite database exists
	if (!existsSync(SQLITE_PATH)) {
		console.log("No SQLite database found at", SQLITE_PATH);
		return { migrated: false, counts: {} };
	}

	// Check if ProseQL data already exists
	if (proseqlDataExists()) {
		console.log("ProseQL data files already exist, skipping migration");
		return { migrated: false, counts: {} };
	}

	console.log("Starting SQLite to ProseQL migration...");
	console.log("Source:", SQLITE_PATH);
	console.log("Destination:", DATA_DIR);

	// Ensure data directory exists
	mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

	const sqlite = new Database(SQLITE_PATH, { readonly: true });

	const counts: Record<string, number> = {};

	try {
		// --- Migrate albums ---
		const sqliteAlbums = sqlite.query<SqliteAlbum, []>("SELECT * FROM albums").all();
		const albums: Album[] = sqliteAlbums.map((row) => ({
			id: row.id,
			title: row.title,
			artist: row.artist,
			...(row.year != null ? { year: row.year } : {}),
			...(row.artwork_url != null ? { artworkUrl: row.artwork_url } : {}),
			createdAt: toMs(row.created_at),
		}));
		counts.albums = albums.length;
		writeYamlCollection(YAML_FILES.albums, albums);
		console.log(`Migrated ${albums.length} albums`);

		// --- Migrate album source refs ---
		const sqliteRefs = sqlite
			.query<SqliteAlbumSourceRef, []>("SELECT * FROM album_source_refs")
			.all();
		const refs: AlbumSourceRef[] = sqliteRefs.map((row) => ({
			id: row.id,
			albumId: row.album_id,
			source: row.source,
			sourceId: row.source_id,
		}));
		counts.albumSourceRefs = refs.length;
		writeYamlCollection(YAML_FILES.albumSourceRefs, refs);
		console.log(`Migrated ${refs.length} album source refs`);

		// --- Migrate album tracks ---
		const sqliteTracks = sqlite
			.query<SqliteAlbumTrack, []>("SELECT * FROM album_tracks")
			.all();
		const tracks: AlbumTrack[] = sqliteTracks.map((row) => ({
			id: row.id,
			albumId: row.album_id,
			trackIndex: row.track_index,
			title: row.title,
			artist: row.artist,
			...(row.duration != null ? { duration: row.duration } : {}),
			source: row.source,
			sourceTrackId: row.source_track_id,
			...(row.artwork_url != null ? { artworkUrl: row.artwork_url } : {}),
		}));
		counts.albumTracks = tracks.length;
		writeYamlCollection(YAML_FILES.albumTracks, tracks);
		console.log(`Migrated ${tracks.length} album tracks`);

		// --- Migrate playlists ---
		const sqlitePlaylists = sqlite
			.query<SqlitePlaylist, []>("SELECT * FROM playlists")
			.all();
		const playlists: Playlist[] = sqlitePlaylists.map((row) => ({
			id: row.id,
			name: row.name,
			source: row.source,
			url: row.url,
			isRadio: row.is_radio === 1,
			...(row.seed_track_id != null ? { seedTrackId: row.seed_track_id } : {}),
			...(row.artwork_url != null ? { artworkUrl: row.artwork_url } : {}),
			createdAt: toMs(row.created_at),
		}));
		counts.playlists = playlists.length;
		writeYamlCollection(YAML_FILES.playlists, playlists);
		console.log(`Migrated ${playlists.length} playlists`);

		// --- Migrate player state ---
		const sqlitePlayerStates = sqlite
			.query<SqlitePlayerState, []>("SELECT * FROM player_state")
			.all();
		const playerStates: PlayerState[] = sqlitePlayerStates.map((row) => ({
			// Map "default" id to "current" for consistency with ProseQL usage
			id: row.id === "default" ? "current" : row.id,
			status: row.status,
			progress: row.progress,
			duration: row.duration,
			volume: row.volume,
			updatedAt: toMs(row.updated_at),
		}));
		counts.playerState = playerStates.length;
		writeYamlCollection(YAML_FILES.playerState, playerStates);
		console.log(`Migrated ${playerStates.length} player state rows`);

		// --- Migrate queue state + queue items (merged) ---
		const sqliteQueueStates = sqlite
			.query<SqliteQueueState, []>("SELECT * FROM queue_state")
			.all();
		const sqliteQueueItems = sqlite
			.query<SqliteQueueItem, []>("SELECT * FROM queue_items ORDER BY queue_index ASC")
			.all();
		counts.queueState = sqliteQueueStates.length;
		counts.queueItems = sqliteQueueItems.length;

		const queueStates: QueueState[] = sqliteQueueStates.map((state) => {
			// Convert queue items to embedded items array
			const items: QueueItem[] = sqliteQueueItems.map((item) => ({
				opaqueTrackId: item.opaque_track_id,
				source: item.source,
				title: item.title,
				artist: item.artist,
				album: item.album,
				...(item.duration != null ? { duration: item.duration } : {}),
				...(item.artwork_url != null ? { artworkUrl: item.artwork_url } : {}),
			}));

			return {
				// Map "default" id to "current" for consistency
				id: state.id === "default" ? "current" : state.id,
				currentIndex: state.current_index,
				contextType: state.context_type,
				...(state.context_id != null ? { contextId: state.context_id } : {}),
				items,
			};
		});
		writeYamlCollection(YAML_FILES.queueState, queueStates);
		console.log(
			`Migrated ${sqliteQueueStates.length} queue state(s) with ${sqliteQueueItems.length} queue items`,
		);

		// --- Migrate listen log (JSONL, not YAML) ---
		const sqliteLogs = sqlite
			.query<SqliteListenLog, []>("SELECT * FROM listen_log ORDER BY listened_at ASC")
			.all();
		const logs: ListenLog[] = sqliteLogs.map((row) => ({
			id: row.id,
			compositeId: row.composite_id,
			title: row.title,
			artist: row.artist,
			...(row.album != null ? { album: row.album } : {}),
			source: row.source,
			listenedAt: toMs(row.listened_at),
		}));
		counts.listenLog = logs.length;
		// Create empty file first, then append
		writeFileSync(LISTEN_LOG_PATH, "", "utf-8");
		appendJsonl(LISTEN_LOG_PATH, logs);
		console.log(`Migrated ${logs.length} listen log entries`);

		console.log("\nMigration complete!");
		console.log("Counts:", counts);

		// Rename SQLite file to .bak (unless .bak already exists)
		if (!existsSync(SQLITE_BAK_PATH)) {
			renameSync(SQLITE_PATH, SQLITE_BAK_PATH);
			console.log(`Renamed ${SQLITE_PATH} to ${SQLITE_BAK_PATH}`);
		} else {
			console.log(`Backup ${SQLITE_BAK_PATH} already exists, keeping original SQLite file`);
		}

		return { migrated: true, counts };
	} finally {
		sqlite.close();
	}
}

// Run if executed directly
if (import.meta.main) {
	migrateFromSqlite()
		.then(({ migrated, counts }) => {
			if (migrated) {
				console.log("\n✓ Migration successful");
				const total = Object.values(counts).reduce((a, b) => a + b, 0);
				console.log(`Total records migrated: ${total}`);
			}
			process.exit(0);
		})
		.catch((err) => {
			console.error("Migration failed:", err);
			process.exit(1);
		});
}
