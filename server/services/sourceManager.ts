import type { PandoraSession } from "../../src/client.js";
import { createSourceManager } from "../../src/sources/index.js";
import type { SourceManager } from "../../src/sources/index.js";
import { createPandoraSource } from "../../src/sources/pandora/index.js";
import { createYtMusicSource } from "../../src/sources/ytmusic/index.js";
import type { Source } from "../../src/sources/types.js";

// Per-session source managers (Pandora needs session auth)
const managers = new Map<string, SourceManager>();

// YTMusic config - could come from a config file in the future
const ytmusicConfig = {
	playlists: [] as { url: string; name?: string }[],
};

export function configureYtMusic(
	playlists: readonly { readonly url: string; readonly name?: string }[],
): void {
	ytmusicConfig.playlists = [...playlists];
	// Clear cached managers to pick up new config
	managers.clear();
}

export function getSourceManager(session: PandoraSession): SourceManager {
	// Use session's userAuthToken as cache key since it's unique per session
	const cacheKey = session.userAuthToken;
	const cached = managers.get(cacheKey);
	if (cached) return cached;

	const sources: Source[] = [createPandoraSource(session)];

	if (ytmusicConfig.playlists.length > 0) {
		sources.push(createYtMusicSource(ytmusicConfig));
	}

	const manager = createSourceManager(sources);
	managers.set(cacheKey, manager);
	return manager;
}

// For the stream endpoint which may not have a session context
// This retrieves the first available source manager or creates a minimal one
let globalManager: SourceManager | undefined;

export function getGlobalSourceManager(): SourceManager | undefined {
	if (globalManager) return globalManager;
	// Return the first cached manager if any exist
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
