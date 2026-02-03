import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import * as schema from "./schema.js";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DbInstance | undefined;

const paths = envPaths("pyxis", { suffix: "" });
const DB_DIR = join(paths.data, "db");
const DB_FILE = join(DB_DIR, "pyxis.db");

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS albums (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	year INTEGER,
	artwork_url TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
	is_radio INTEGER NOT NULL DEFAULT 0,
	seed_track_id TEXT,
	artwork_url TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
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

export function getDb(): DbInstance {
	if (dbInstance) return dbInstance;

	mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });

	// Migrate from PGlite if needed
	migratePgliteIfNeeded();

	const sqlite = new Database(DB_FILE);
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	sqlite.exec(MIGRATION_SQL);
	dbInstance = drizzle(sqlite, { schema });
	return dbInstance;
}

/**
 * If PGlite data exists (PG_VERSION marker) but no SQLite file yet,
 * back up the PGlite directory. Data migration from PGlite's internal
 * format requires PGlite itself; since we're removing that dependency,
 * we preserve the directory as a backup for manual recovery.
 */
function migratePgliteIfNeeded(): void {
	const pgVersionPath = join(DB_DIR, "PG_VERSION");
	if (existsSync(pgVersionPath) && !existsSync(DB_FILE)) {
		const backupDir = `${DB_DIR}.pglite.bak`;
		if (!existsSync(backupDir)) {
			renameSync(DB_DIR, backupDir);
			mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
		}
	}
}

export { schema };
