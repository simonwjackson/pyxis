import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
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

export async function getDb() {
	if (dbInstance) return dbInstance;

	mkdirSync(DB_PATH, { recursive: true, mode: 0o700 });
	pgliteInstance = new PGlite(DB_PATH);
	await pgliteInstance.exec(MIGRATION_SQL);
	dbInstance = drizzle(pgliteInstance, { schema });
	return dbInstance;
}

export { schema };
