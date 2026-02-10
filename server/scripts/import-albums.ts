/**
 * @module server/scripts/import-albums
 * Batch import script for adding albums to the library from a YAML file.
 * Reads album definitions with source IDs, fetches full album data via YTMusic,
 * and persists albums with tracks to the database.
 *
 * @example
 * ```bash
 * # Import from default path
 * bun server/scripts/import-albums.ts
 *
 * # Import from custom YAML file
 * bun server/scripts/import-albums.ts /path/to/albums.yaml
 * ```
 *
 * YAML format:
 * ```yaml
 * albums:
 *   - title: "Album Name"
 *     artist: "Artist Name"
 *     sources:
 *       - type: ytmusic
 *         id: "OLAK5uy_..."
 * ```
 */

import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { getDb, schema } from "../../src/db/index.js";
import { createSourceManager } from "../../src/sources/index.js";
import { createYtMusicSource } from "../../src/sources/ytmusic/index.js";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../../src/logger.js";
import type { SourceType } from "../../src/sources/types.js";

const YAML_PATH =
	process.argv[2] ??
	"/home/simonwjackson/.claude-accounts/personal/albums.yaml";
const DELAY_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const logger = createLogger("import");

/**
 * Source reference within an album YAML entry.
 */
type AlbumSource = {
	readonly type: string;
	readonly id: string;
};

/**
 * Album entry structure from the YAML import file.
 */
type AlbumEntry = {
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly artworkUrl?: string;
	readonly sources: readonly AlbumSource[];
};

/**
 * Root structure of the albums YAML file.
 */
type YamlData = {
	readonly albums: readonly AlbumEntry[];
};

/**
 * Promise-based delay utility for rate limiting API requests.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates a short unique ID for database records.
 *
 * @returns 10-character nanoid string
 */
function generateId(): string {
	return nanoid(10);
}

/**
 * Main import loop.
 * Reads YAML file, initializes YTMusic source, iterates through albums,
 * fetches full album data with tracks, and persists to database.
 * Includes retry logic for transient failures.
 */
async function main(): Promise<void> {
	const raw = readFileSync(YAML_PATH, "utf-8");
	const data = parse(raw) as YamlData;
	const albums = data.albums;

	console.log(`Found ${albums.length} albums in ${YAML_PATH}`);
	console.log("Mode: direct in-process (no HTTP server needed)");
	console.log("---");

	// Initialize DB and source manager directly
	const db = await getDb();
	const ytmusic = createYtMusicSource({ playlists: [] });
	const sourceManager = createSourceManager([ytmusic], [], logger);

	let succeeded = 0;
	let skipped = 0;
	let failed = 0;
	const failures: Array<{
		readonly index: number;
		readonly title: string;
		readonly artist: string;
		readonly error: string;
	}> = [];

	for (let i = 0; i < albums.length; i++) {
		const album = albums[i];
		if (!album) continue;

		const source = album.sources[0];
		if (!source) {
			console.log(
				`[${i + 1}/${albums.length}] SKIP (no source): ${album.title} - ${album.artist}`,
			);
			skipped++;
			continue;
		}

		const sourceType = source.type as SourceType;
		const albumId = source.id;

		// Check if already exists
		const existing = await db
			.select()
			.from(schema.albumSourceRefs)
			.where(
				and(
					eq(schema.albumSourceRefs.source, sourceType),
					eq(schema.albumSourceRefs.sourceId, albumId),
				),
			);
		if (existing[0]) {
			console.log(
				`[${i + 1}/${albums.length}] EXISTS: ${album.title} - ${album.artist}`,
			);
			skipped++;
			continue;
		}

		let lastError = "";
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const { album: fetchedAlbum, tracks } =
					await sourceManager.getAlbumTracks(sourceType, albumId);

				const newAlbumId = generateId();

				await db.transaction(async (tx) => {
					await tx.insert(schema.albums).values({
						id: newAlbumId,
						title: fetchedAlbum.title,
						artist: fetchedAlbum.artist,
						...(fetchedAlbum.year != null
							? { year: fetchedAlbum.year }
							: {}),
						...(fetchedAlbum.artworkUrl != null
							? { artworkUrl: fetchedAlbum.artworkUrl }
							: {}),
					});

					for (const sid of fetchedAlbum.sourceIds) {
						await tx.insert(schema.albumSourceRefs).values({
							id: `${newAlbumId}-${sid.source}-${sid.id}`,
							albumId: newAlbumId,
							source: sid.source,
							sourceId: sid.id,
						});
					}

					for (const [index, track] of tracks.entries()) {
						await tx.insert(schema.albumTracks).values({
							id: generateId(),
							albumId: newAlbumId,
							trackIndex: index,
							title: track.title,
							artist: track.artist,
							...(track.duration != null
								? { duration: Math.round(track.duration) }
								: {}),
							source: track.sourceId.source,
							sourceTrackId: track.sourceId.id,
							...(track.artworkUrl != null
								? { artworkUrl: track.artworkUrl }
								: {}),
						});
					}
				});

				console.log(
					`[${i + 1}/${albums.length}] SAVED: ${fetchedAlbum.title} - ${fetchedAlbum.artist} (${newAlbumId}, ${tracks.length} tracks)`,
				);
				succeeded++;
				lastError = "";
				break;
			} catch (err) {
				lastError = err instanceof Error ? err.message : String(err);
				if (attempt < MAX_RETRIES) {
					console.warn(
						`  Retry ${attempt + 1}/${MAX_RETRIES} for ${album.title}: ${lastError.slice(0, 120)}`,
					);
					await sleep(RETRY_DELAY_MS);
				}
			}
		}

		if (lastError) {
			console.error(
				`[${i + 1}/${albums.length}] FAILED: ${album.title} - ${album.artist} (${lastError})`,
			);
			failures.push({
				index: i + 1,
				title: album.title,
				artist: album.artist,
				error: lastError,
			});
			failed++;
		}

		if (i < albums.length - 1) {
			await sleep(DELAY_MS);
		}
	}

	console.log("---");
	console.log(
		`Done. Imported ${succeeded}/${albums.length} albums (${skipped} skipped, ${failed} failed)`,
	);

	if (failures.length > 0) {
		console.log("\nFailed albums:");
		for (const f of failures) {
			console.log(`  [${f.index}] ${f.title} - ${f.artist}: ${f.error}`);
		}
	}

	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
