/**
 * @module sourceManager
 * Factory and lifecycle management for music source managers.
 * Creates per-session source managers with Pandora auth, caches shared sources,
 * and provides a global fallback manager for unauthenticated requests.
 */

import type { PandoraSession } from "../../src/sources/pandora/client.js";
import { createSourceManager } from "../../src/sources/index.js";
import type { SourceManager } from "../../src/sources/index.js";
import { createPandoraSource, isPandoraSource } from "../../src/sources/pandora/index.js";
import type { PlaylistItem } from "../../src/sources/pandora/types/api.js";
import { createYtMusicSource } from "../../src/sources/ytmusic/index.js";
import type { YtMusicPlaylistEntry } from "../../src/sources/ytmusic/index.js";
import type { Source, MetadataSource } from "../../src/sources/types.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";
import { createMusicBrainzSource } from "../../src/sources/musicbrainz/index.js";
import { createDiscogsSource } from "../../src/sources/discogs/index.js";
import { createDeezerSource } from "../../src/sources/deezer/index.js";
import { createBandcampFullSource } from "../../src/sources/bandcamp/index.js";
import { createSoundCloudFullSource } from "../../src/sources/soundcloud/index.js";
import { createYouTubeSource } from "../../src/sources/youtube/index.js";
import type { AppConfig } from "../../src/config.js";
import { createLogger } from "../../src/logger.js";

const logger = createLogger("server");

// Per-session source managers (Pandora needs session auth)
const managers = new Map<string, SourceManager>();

// Cached shared sources (built once, reused across all sessions)
/**
 * Container for sources that are shared across all sessions.
 * Primary sources provide streaming/search, metadata sources enrich album data.
 */
type SharedSources = {
	readonly primarySources: readonly Source[];
	readonly metadataSources: readonly MetadataSource[];
};
let cachedSharedSources: SharedSources | undefined;

/**
 * Loads YTMusic playlist entries from the database.
 * These are user-saved playlists and radio stations persisted in PGlite.
 *
 * @returns Array of YTMusic playlist entries with id, url, name, and isRadio flag
 */
async function loadYtMusicPlaylistsFromDb(): Promise<YtMusicPlaylistEntry[]> {
	const db = await getDb();
	const rows = await db
		.select()
		.from(schema.playlists)
		.where(eq(schema.playlists.source, "ytmusic"));
	return rows.map((row) => ({
		id: row.id,
		url: row.url,
		name: row.name,
		isRadio: row.isRadio,
	}));
}

/**
 * Builds and caches the shared source instances based on application config.
 * Creates metadata sources (MusicBrainz, Discogs, Deezer) and dual-purpose
 * sources (Bandcamp, SoundCloud) that are reused across all sessions.
 *
 * @param config - Application configuration with source enable flags and credentials
 * @returns Object containing arrays of primary and metadata sources
 */
async function buildSharedSources(config: AppConfig): Promise<SharedSources> {
	if (cachedSharedSources) return cachedSharedSources;

	const primarySources: Source[] = [];
	const metadataSources: MetadataSource[] = [];

	// --- Metadata-only sources ---

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
		const discogsToken = config.sources.discogs.token;
		metadataSources.push(
			createDiscogsSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
				...(discogsToken != null ? { token: discogsToken } : {}),
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

	// --- Always-available sources ---
	primarySources.push(createYouTubeSource());

	// --- Dual-registered sources (primary + metadata) ---

	if (config.sources.bandcamp.enabled) {
		const bandcampFull = createBandcampFullSource({
			appName: "Pyxis",
			version: "1.0.0",
			contact: "https://github.com/simonwjackson/pyxis",
		});
		primarySources.push(bandcampFull);
		metadataSources.push(bandcampFull);
	}

	if (config.sources.soundcloud.enabled) {
		try {
			const soundcloudFull = await createSoundCloudFullSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
				...(config.sources.soundcloud.clientId != null
					? { clientId: config.sources.soundcloud.clientId }
					: {}),
			});
			primarySources.push(soundcloudFull);
			metadataSources.push(soundcloudFull);
		} catch (err) {
			logger.warn(
				{ err: String(err) },
				"SoundCloud source initialization failed (client_id extraction); skipping",
			);
		}
	}

	cachedSharedSources = { primarySources, metadataSources };
	return cachedSharedSources;
}

// Store config reference for metadata source creation
let appConfig: AppConfig | undefined;

/**
 * Sets the application config for source initialization.
 * Resets cached shared sources to pick up config changes.
 *
 * @param config - Application configuration with source settings
 */
export function setAppConfig(config: AppConfig): void {
	appConfig = config;
	// Reset cached shared sources when config changes
	cachedSharedSources = undefined;
}

/**
 * Clears all cached source managers.
 * Call after session refresh or credential changes to force re-creation.
 */
export function invalidateManagers(): void {
	managers.clear();
}

/**
 * Gets or creates a source manager for an authenticated Pandora session.
 * Caches managers by userAuthToken to avoid recreating sources per-request.
 *
 * @param session - Authenticated Pandora session
 * @returns Source manager with Pandora, YTMusic, and configured metadata sources
 */
export async function getSourceManager(
	session: PandoraSession,
): Promise<SourceManager> {
	const cacheKey = session.userAuthToken;
	const cached = managers.get(cacheKey);
	if (cached) return cached;

	const sources: Source[] = [createPandoraSource(session)];

	// Always include YTMusic source — DB-backed playlists + search + streaming
	const dbPlaylists = await loadYtMusicPlaylistsFromDb();
	sources.push(createYtMusicSource({ playlists: dbPlaylists }));

	// Add shared primary sources (Bandcamp, SoundCloud)
	const shared = appConfig ? await buildSharedSources(appConfig) : { primarySources: [], metadataSources: [] };
	sources.push(...shared.primarySources);

	const manager = createSourceManager(sources, shared.metadataSources, logger);
	managers.set(cacheKey, manager);
	return manager;
}

/**
 * Registers Pandora playlist items in the source's track cache.
 * Required before getStreamUrl can resolve Pandora track URLs.
 *
 * @param manager - Source manager containing a Pandora source
 * @param items - Playlist items from a Pandora getPlaylist response
 */
export function registerPandoraPlaylistItems(
	manager: SourceManager,
	items: readonly PlaylistItem[],
): void {
	const pandoraSource = manager.getSource("pandora");
	if (pandoraSource && isPandoraSource(pandoraSource)) {
		pandoraSource.registerPlaylistItems(items);
	}
}

// For the stream endpoint which may not have a session context
let globalManager: SourceManager | undefined;

/**
 * Gets the global source manager if one exists.
 * Falls back to any cached per-session manager if no global manager is set.
 *
 * @returns The global source manager, or undefined if none exists
 */
export function getGlobalSourceManager(): SourceManager | undefined {
	if (globalManager) return globalManager;
	const first = managers.values().next();
	if (!first.done) {
		globalManager = first.value;
		return globalManager;
	}
	return undefined;
}

/**
 * Sets the global source manager explicitly.
 * Used after successful login to make the authenticated manager globally available.
 *
 * @param manager - Source manager to set as the global default
 */
export function setGlobalSourceManager(manager: SourceManager): void {
	globalManager = manager;
}

/**
 * Returns the existing source manager, or lazily creates a YTMusic-only
 * source manager when none exists (e.g. after a server restart before login).
 * When a user logs in later, the full manager (Pandora + YTMusic) replaces it.
 */
export async function ensureSourceManager(): Promise<SourceManager> {
	const existing = getGlobalSourceManager();
	if (existing) return existing;

	const dbPlaylists = await loadYtMusicPlaylistsFromDb();
	const sources: Source[] = [
		createYtMusicSource({ playlists: dbPlaylists }),
		createYouTubeSource(),
	];

	// Add shared primary sources (Bandcamp, SoundCloud)
	const shared = appConfig ? await buildSharedSources(appConfig) : { primarySources: [], metadataSources: [] };
	sources.push(...shared.primarySources);

	const manager = createSourceManager(sources, shared.metadataSources, logger);
	globalManager = manager;
	return manager;
}
