/**
 * Enrich existing library albums with metadata from MusicBrainz, Discogs, Deezer, etc.
 *
 * Usage: bun server/scripts/enrich-library.ts [--config <path>] [--delay <ms>] [--dry-run]
 */

import { getDb, schema } from "../../src/db/index.js";
import { resolveConfig } from "../../src/config.js";
import { createMusicBrainzSource } from "../../src/sources/musicbrainz/index.js";
import { createDiscogsSource } from "../../src/sources/discogs/index.js";
import { createDeezerSource } from "../../src/sources/deezer/index.js";
import { createBandcampFullSource } from "../../src/sources/bandcamp/index.js";
import { createSoundCloudFullSource } from "../../src/sources/soundcloud/index.js";
import { createMatcher } from "../../src/sources/matcher.js";
import { createLogger } from "../../src/logger.js";
import { eq } from "drizzle-orm";
import type {
	MetadataSource,
	MetadataSearchQuery,
	NormalizedRelease,
	Source,
	SourceType,
} from "../../src/sources/types.js";
import { hasMetadataSearchCapability } from "../../src/sources/types.js";

const logger = createLogger("enrich");

// --- CLI args ---

const cliArgs = process.argv.slice(2);
let configPath: string | undefined;
let delayMs = 1500;
let dryRun = false;

for (let i = 0; i < cliArgs.length; i++) {
	const arg = cliArgs[i];
	if (arg === "--config" && cliArgs[i + 1]) {
		configPath = cliArgs[++i];
	} else if (arg === "--delay" && cliArgs[i + 1]) {
		delayMs = Number.parseInt(cliArgs[++i]!, 10);
	} else if (arg === "--dry-run") {
		dryRun = true;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	const config = resolveConfig(configPath);

	// Build metadata sources from config (same logic as sourceManager.ts)
	const metadataSources: MetadataSource[] = [];

	if (config.sources.musicbrainz.enabled) {
		metadataSources.push(
			createMusicBrainzSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
			}),
		);
	}

	if (config.sources.discogs.enabled) {
		metadataSources.push(
			createDiscogsSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
				...(config.sources.discogs.token != null
					? { token: config.sources.discogs.token }
					: {}),
			}),
		);
	}

	if (config.sources.deezer.enabled) {
		metadataSources.push(
			createDeezerSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
			}),
		);
	}

	if (config.sources.bandcamp.enabled) {
		const bandcamp = createBandcampFullSource({
			appName: "Pyxis",
			version: "1.0.0",
			contact: "https://github.com/simonwjackson/pyxis",
		});
		metadataSources.push(bandcamp);
	}

	if (config.sources.soundcloud.enabled) {
		try {
			const soundcloud = await createSoundCloudFullSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
				...(config.sources.soundcloud.clientId != null
					? { clientId: config.sources.soundcloud.clientId }
					: {}),
			});
			metadataSources.push(soundcloud);
		} catch (err) {
			logger.warn(
				{ err: String(err) },
				"SoundCloud init failed, skipping",
			);
		}
	}

	const searchableMeta = metadataSources.filter(hasMetadataSearchCapability);

	if (searchableMeta.length === 0) {
		console.error(
			"No metadata sources enabled. Check config or enable musicbrainz/discogs/deezer.",
		);
		process.exit(1);
	}

	console.log(
		`Metadata sources: ${searchableMeta.map((s) => s.type).join(", ")}`,
	);
	if (dryRun) console.log("DRY RUN - no DB writes");
	console.log(`Delay between albums: ${delayMs}ms`);
	console.log("---");

	// Load all library albums with their existing source refs
	const db = await getDb();
	const allAlbums = await db.select().from(schema.albums);
	const allRefs = await db.select().from(schema.albumSourceRefs);

	console.log(`Library contains ${allAlbums.length} albums\n`);

	let enrichedCount = 0;
	let skippedCount = 0;
	let failedCount = 0;

	for (let i = 0; i < allAlbums.length; i++) {
		const album = allAlbums[i]!;
		const existingRefs = allRefs.filter((r) => r.albumId === album.id);
		const prefix = `[${i + 1}/${allAlbums.length}]`;

		// Build structured query
		const query: MetadataSearchQuery = {
			kind: "structured",
			title: album.title,
			artist: album.artist,
		};

		try {
			// Query all metadata sources in parallel (1 result each is enough)
			const results = await Promise.allSettled(
				searchableMeta.map((source) => source.searchReleases(query, 1)),
			);

			// Collect successful results
			const metadataAlbums: NormalizedRelease[] = [];
			for (let j = 0; j < results.length; j++) {
				const result = results[j]!;
				if (result.status === "fulfilled") {
					metadataAlbums.push(...result.value);
				} else {
					const source = searchableMeta[j];
					logger.warn(
						{ source: source?.type, err: String(result.reason) },
						"metadata source failed",
					);
				}
			}

			if (metadataAlbums.length === 0) {
				console.log(`${prefix} NO MATCHES: ${album.title} - ${album.artist}`);
				skippedCount++;
				if (i < allAlbums.length - 1) await sleep(delayMs);
				continue;
			}

			// Create matcher, seed with existing album data, then merge metadata
			const matcher = createMatcher({ similarityThreshold: 0.85 });

			// Seed with the existing album as a NormalizedRelease
			const existingNormalized: NormalizedRelease = {
				fingerprint: "",
				title: album.title,
				artists: [
					{
						name: album.artist,
						ids: existingRefs.map((r) => ({
							source: r.source as SourceType,
							id: r.sourceId,
						})),
					},
				],
				releaseType: "album",
				...(album.year != null ? { year: album.year } : {}),
				ids: existingRefs.map((r) => ({
					source: r.source as SourceType,
					id: r.sourceId,
				})),
				confidence: 1,
				genres: [],
				...(album.artworkUrl != null
					? { artworkUrl: album.artworkUrl }
					: {}),
			};

			matcher.addOrMerge(existingNormalized);

			for (const metaAlbum of metadataAlbums) {
				matcher.addOrMerge(metaAlbum);
			}

			const merged = matcher.getAll()[0];
			if (!merged) {
				console.log(`${prefix} NO MATCHES: ${album.title} - ${album.artist}`);
				skippedCount++;
				if (i < allAlbums.length - 1) await sleep(delayMs);
				continue;
			}

			const stats = matcher.getStats();

			// Determine new source refs to add
			const existingRefKeys = new Set(
				existingRefs.map((r) => `${r.source}:${r.sourceId}`),
			);
			const newSourceIds = merged.ids.filter(
				(id) => !existingRefKeys.has(`${id.source}:${id.id}`),
			);

			// Check if artwork improved
			const artworkImproved =
				merged.artworkUrl != null && merged.artworkUrl !== album.artworkUrl;

			if (newSourceIds.length === 0 && !artworkImproved) {
				console.log(
					`${prefix} UP TO DATE: ${album.title} - ${album.artist}`,
				);
				skippedCount++;
				if (i < allAlbums.length - 1) await sleep(delayMs);
				continue;
			}

			// Apply changes
			const changes: string[] = [];

			if (!dryRun) {
				await db.transaction(async (tx) => {
					// Insert new source refs
					for (const sid of newSourceIds) {
						await tx
							.insert(schema.albumSourceRefs)
							.values({
								id: `${album.id}-${sid.source}-${sid.id}`,
								albumId: album.id,
								source: sid.source,
								sourceId: sid.id,
							})
							.onConflictDoNothing();
					}

					// Update artwork if improved
					if (artworkImproved) {
						await tx
							.update(schema.albums)
							.set({ artworkUrl: merged.artworkUrl })
							.where(eq(schema.albums.id, album.id));
					}
				});
			}

			if (newSourceIds.length > 0) {
				changes.push(
					`+${newSourceIds.length} sources (${newSourceIds.map((s) => s.source).join(", ")})`,
				);
			}
			if (artworkImproved) {
				changes.push("artwork updated");
			}

			console.log(
				`${prefix} ENRICHED: ${album.title} - ${album.artist} [${changes.join("; ")}] (exact=${stats.exactMatches}, fuzzy=${stats.fuzzyMatches})`,
			);
			enrichedCount++;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(
				`${prefix} ERROR: ${album.title} - ${album.artist} (${msg})`,
			);
			failedCount++;
		}

		if (i < allAlbums.length - 1) {
			await sleep(delayMs);
		}
	}

	console.log("\n---");
	console.log(
		`Done. ${enrichedCount} enriched, ${skippedCount} skipped, ${failedCount} failed (${allAlbums.length} total)`,
	);

	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
