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
import type { AppConfig } from "../../src/config.js";
import { createLogger } from "../../src/logger.js";

const logger = createLogger("server");

// Per-session source managers (Pandora needs session auth)
const managers = new Map<string, SourceManager>();

// Cached metadata sources (shared across all sessions)
let cachedMetadataSources: readonly MetadataSource[] | undefined;

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

function buildMetadataSources(config: AppConfig): readonly MetadataSource[] {
	if (cachedMetadataSources) return cachedMetadataSources;

	const sources: MetadataSource[] = [];

	if (config.sources.musicbrainz.enabled) {
		sources.push(
			createMusicBrainzSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
			}),
		);
	}

	if (config.sources.discogs.enabled) {
		const discogsToken = config.sources.discogs.token;
		sources.push(
			createDiscogsSource({
				appName: "Pyxis",
				version: "1.0.0",
				contact: "https://github.com/simonwjackson/pyxis",
				...(discogsToken != null ? { token: discogsToken } : {}),
			}),
		);
	}

	cachedMetadataSources = sources;
	return sources;
}

// Store config reference for metadata source creation
let appConfig: AppConfig | undefined;

export function setAppConfig(config: AppConfig): void {
	appConfig = config;
	// Reset cached metadata sources when config changes
	cachedMetadataSources = undefined;
}

export function invalidateManagers(): void {
	managers.clear();
}

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

	const metadataSources = appConfig ? buildMetadataSources(appConfig) : [];

	const manager = createSourceManager(sources, metadataSources, logger);
	managers.set(cacheKey, manager);
	return manager;
}

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

export function getGlobalSourceManager(): SourceManager | undefined {
	if (globalManager) return globalManager;
	const first = managers.values().next();
	if (!first.done) {
		globalManager = first.value;
		return globalManager;
	}
	return undefined;
}

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
	const sources: Source[] = [createYtMusicSource({ playlists: dbPlaylists })];
	const metadataSources = appConfig ? buildMetadataSources(appConfig) : [];
	const manager = createSourceManager(sources, metadataSources, logger);
	globalManager = manager;
	return manager;
}
