/**
 * @module Database
 * ProseQL database connection using Effect and YAML/JSONL persistence.
 * Database files are stored in XDG_DATA_HOME/pyxis/db/ (typically ~/.local/share/pyxis/db/).
 *
 * On first startup after migration from SQLite:
 * - If pyxis.db exists but YAML files don't, auto-migrates data
 * - Renames pyxis.db to pyxis.db.bak after successful migration
 */

import { Effect, Exit, Scope } from "effect";
import {
	createNodeDatabase,
	type GenerateDatabaseWithPersistence,
} from "@proseql/node";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import { dbConfig, DB_DIR, type DbConfig } from "./config.js";

const paths = envPaths("pyxis", { suffix: "" });
const SQLITE_PATH = join(paths.data, "pyxis.db");
const SQLITE_BAK_PATH = join(paths.data, "pyxis.db.bak");

// YAML/JSONL file paths to check for existing ProseQL data
const YAML_FILES = [
	join(DB_DIR, "albums.yaml"),
	join(DB_DIR, "album-source-refs.yaml"),
	join(DB_DIR, "album-tracks.yaml"),
	join(DB_DIR, "playlists.yaml"),
	join(DB_DIR, "player-state.yaml"),
	join(DB_DIR, "queue-state.yaml"),
	join(DB_DIR, "listen-log.jsonl"),
];

/**
 * Check if any ProseQL data files already exist.
 */
function proseqlDataExists(): boolean {
	return YAML_FILES.some((f) => existsSync(f));
}

/**
 * Check if SQLite migration is needed and run it if so.
 * Migration runs if: pyxis.db exists AND no YAML files exist AND no .bak exists.
 */
async function maybeRunMigration(): Promise<void> {
	// Skip if .bak already exists (migration already ran)
	if (existsSync(SQLITE_BAK_PATH)) return;

	// Skip if no SQLite database
	if (!existsSync(SQLITE_PATH)) return;

	// Skip if ProseQL data already exists
	if (proseqlDataExists()) return;

	// Dynamic import to avoid loading bun:sqlite unless needed
	const { migrateFromSqlite } = await import(
		"../../server/scripts/migrate-sqlite.js"
	);
	await migrateFromSqlite();
}

export type DbInstance = GenerateDatabaseWithPersistence<DbConfig>;

let dbInstance: DbInstance | undefined;
let dbScope: Scope.CloseableScope | undefined;

/**
 * Gets the singleton database instance, creating it if needed.
 * Initializes ProseQL with NodeStorageLayer and yamlCodec.
 *
 * @returns Promise resolving to ProseQL database instance
 *
 * @example
 * ```ts
 * const db = await getDb();
 * const albums = await db.albums.query({}).runPromise;
 * ```
 */
export async function getDb(): Promise<DbInstance> {
	if (dbInstance) return dbInstance;

	mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });

	// Auto-migrate from SQLite if needed (first startup after code update)
	await maybeRunMigration();

	// Create a scope for the database lifecycle
	dbScope = await Effect.runPromise(Scope.make());

	const program = createNodeDatabase(dbConfig);

	// Use Scope.extend to provide the scope without auto-closing
	dbInstance = await Effect.runPromise(Scope.extend(program, dbScope));

	return dbInstance;
}

/**
 * Closes the database and releases resources.
 * Call this on server shutdown for clean exit.
 */
export async function closeDb(): Promise<void> {
	if (dbInstance) {
		await dbInstance.flush();
	}
	if (dbScope) {
		await Effect.runPromise(Scope.close(dbScope, Exit.void));
		dbScope = undefined;
	}
	dbInstance = undefined;
}

export * from "./config.js";
