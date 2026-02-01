import type { PandoraSession } from "../../src/sources/pandora/client.js";
import { createSourceManager } from "../../src/sources/index.js";
import type { SourceManager } from "../../src/sources/index.js";
import { createPandoraSource } from "../../src/sources/pandora/index.js";
import { createYtMusicSource } from "../../src/sources/ytmusic/index.js";
import type { YtMusicPlaylistEntry } from "../../src/sources/ytmusic/index.js";
import type { Source } from "../../src/sources/types.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";

// Per-session source managers (Pandora needs session auth)
const managers = new Map<string, SourceManager>();

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

	const manager = createSourceManager(sources);
	managers.set(cacheKey, manager);
	return manager;
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
	const manager = createSourceManager(sources);
	globalManager = manager;
	return manager;
}
