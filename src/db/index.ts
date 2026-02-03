import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import { nanoid } from "nanoid";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
let pgliteInstance: PGlite | undefined;

const paths = envPaths("pyxis", { suffix: "" });
const DB_PATH = join(paths.data, "db");

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS albums (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	year INTEGER,
	artwork_url TEXT,
	created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS album_source_refs (
	id TEXT PRIMARY KEY,
	album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
	source TEXT NOT NULL,
	source_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS album_tracks (
	id TEXT PRIMARY KEY,
	album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
	track_index INTEGER NOT NULL,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	duration INTEGER,
	source TEXT NOT NULL,
	source_track_id TEXT NOT NULL,
	artwork_url TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	is_radio BOOLEAN NOT NULL DEFAULT FALSE,
	seed_track_id TEXT,
	artwork_url TEXT,
	created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS player_state (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	progress REAL NOT NULL DEFAULT 0,
	duration REAL NOT NULL DEFAULT 0,
	volume INTEGER NOT NULL DEFAULT 100,
	updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_items (
	id TEXT PRIMARY KEY,
	queue_index INTEGER NOT NULL,
	opaque_track_id TEXT NOT NULL,
	source TEXT NOT NULL,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	album TEXT NOT NULL,
	duration INTEGER,
	artwork_url TEXT
);

CREATE TABLE IF NOT EXISTS queue_state (
	id TEXT PRIMARY KEY,
	current_index INTEGER NOT NULL DEFAULT 0,
	context_type TEXT NOT NULL,
	context_id TEXT
);

-- Drop legacy credential tables if they exist
DROP TABLE IF EXISTS source_credentials;
DROP TABLE IF EXISTS credentials;
`;

/**
 * Migrate old-format album/track IDs (raw source IDs or "{albumId}-track-{index}")
 * to nanoid format. Detects old format by checking if albums.id contains ':'
 * or is longer than 21 characters (nanoids are 10 chars).
 */
async function migrateToNanoids(pg: PGlite): Promise<void> {
	const albumRows = await pg.query<{ id: string }>("SELECT id FROM albums");
	const needsMigration = albumRows.rows.some(
		(row) => row.id.includes(":") || row.id.length > 21,
	);
	if (!needsMigration || albumRows.rows.length === 0) return;

	for (const album of albumRows.rows) {
		const newAlbumId = nanoid(10);

		// Update album_tracks first (FK child)
		await pg.query("UPDATE album_tracks SET album_id = $1 WHERE album_id = $2", [newAlbumId, album.id]);
		// Update album_source_refs (FK child)
		await pg.query("UPDATE album_source_refs SET album_id = $1 WHERE album_id = $2", [newAlbumId, album.id]);
		// Update the album itself
		await pg.query("UPDATE albums SET id = $1 WHERE id = $2", [newAlbumId, album.id]);
	}

	// Migrate track IDs to nanoids
	const trackRows = await pg.query<{ id: string }>("SELECT id FROM album_tracks");
	for (const track of trackRows.rows) {
		const newTrackId = nanoid(10);
		// Update queue_items that reference this track's old opaque ID
		// Old format was base64url("source:sourceTrackId") — queue items store opaqueTrackId
		// We can't reliably map old base64 IDs, so we'll clear the queue instead
		await pg.query("UPDATE album_tracks SET id = $1 WHERE id = $2", [newTrackId, track.id]);
	}

	// Clear queue items since old opaque IDs are no longer valid
	await pg.query("DELETE FROM queue_items");
}

export async function getDb() {
	if (dbInstance) return dbInstance;

	mkdirSync(DB_PATH, { recursive: true, mode: 0o700 });
	pgliteInstance = new PGlite(DB_PATH);
	await pgliteInstance.exec(MIGRATION_SQL);
	await migrateToNanoids(pgliteInstance);
	dbInstance = drizzle(pgliteInstance, { schema });
	return dbInstance;
}

export { schema };
