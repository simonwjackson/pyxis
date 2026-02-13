/**
 * @module Database
 * ProseQL database connection using Effect and YAML/JSONL persistence.
 * Database files are stored in XDG_DATA_HOME/pyxis/db/ (typically ~/.local/share/pyxis/db/).
 */

import { Effect, Exit, Scope } from "effect";
import {
	createNodeDatabase,
	type GenerateDatabaseWithPersistence,
} from "@proseql/node";
import { mkdirSync } from "node:fs";
import { dbConfig, DB_DIR, type DbConfig } from "./config.js";

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
