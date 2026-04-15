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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { dbConfig, DB_DIR, type DbConfig } from "./config.js";

const ALBUMS_PATH = join(DB_DIR, "albums.yaml");
const LISTEN_LOG_PATH = join(DB_DIR, "listen-log.jsonl");

/**
 * Backfill first-slice album placement fields for existing YAML libraries.
 */
export function backfillAlbumPlacementFile(filePath: string): boolean {
	if (!existsSync(filePath)) return false;

	const content = readFileSync(filePath, "utf-8");
	if (content.trim().length === 0) return false;

	const parsed = parseYaml(content);
	if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return false;
	}

	let changed = false;
	for (const entity of Object.values(parsed as Record<string, unknown>)) {
		if (entity == null || typeof entity !== "object" || Array.isArray(entity)) {
			continue;
		}

		const album = entity as Record<string, unknown>;
		if (album.placement === undefined) {
			album.placement = "collection";
			changed = true;
		}
		if (album.placementUpdatedAt === undefined) {
			album.placementUpdatedAt = typeof album.createdAt === "number" && Number.isFinite(album.createdAt)
				? album.createdAt
				: Date.now();
			changed = true;
		}
	}

	if (!changed) return false;

	writeFileSync(filePath, stringifyYaml(parsed, { lineWidth: 0 }), "utf-8");
	return true;
}

function splitConcatenatedJsonObjects(line: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === "{") depth += 1;
		if (ch === "}") {
			depth -= 1;
			if (depth === 0) {
				parts.push(line.slice(start, i + 1));
				start = i + 1;
			}
		}
	}

	if (start < line.length) {
		parts.push(line.slice(start));
	}

	return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function repairJsonlFile(filePath: string): boolean {
	if (!existsSync(filePath)) return false;

	const content = readFileSync(filePath, "utf-8");
	if (content.trim().length === 0) return false;

	const repairedLines: string[] = [];
	let changed = false;

	for (const line of content.split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		try {
			JSON.parse(line);
			repairedLines.push(line);
			continue;
		} catch {
			const parts = splitConcatenatedJsonObjects(line);
			if (parts.length <= 1) {
				throw new Error(`Malformed JSONL line in ${filePath}`);
			}
			for (const part of parts) {
				JSON.parse(part);
				repairedLines.push(part);
			}
			changed = true;
		}
	}

	if (!changed) return false;

	writeFileSync(filePath, `${repairedLines.join("\n")}\n`, "utf-8");
	return true;
}

export type DbInstance = GenerateDatabaseWithPersistence<DbConfig>;

let dbInstance: DbInstance | undefined;
let dbScope: Scope.CloseableScope | undefined;

/**
 * Gets the singleton database instance, creating it if needed.
 */
export async function getDb(): Promise<DbInstance> {
	if (dbInstance) return dbInstance;

	mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });

	// Backfill first-slice album placement fields for existing YAML libraries.
	backfillAlbumPlacementFile(ALBUMS_PATH);

	// Repair append-only JSONL files if a partial write glued multiple objects together.
	repairJsonlFile(LISTEN_LOG_PATH);

	dbScope = await Effect.runPromise(Scope.make());
	const program = createNodeDatabase(dbConfig);
	dbInstance = await Effect.runPromise(Scope.extend(program, dbScope));

	return dbInstance;
}

/**
 * Closes the database and releases resources.
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
