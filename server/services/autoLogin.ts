import { getSourceManager, setGlobalSourceManager, ensureSourceManager } from "./sourceManager.js";
import {
	migrateLegacyCredentials,
	restoreAllSessions,
	getPandoraSessionFromCredentials,
} from "./credentials.js";
import * as PlayerService from "./player.js";
import * as QueueService from "./queue.js";
import { decodeId, encodeId } from "../lib/ids.js";
import type { Logger } from "../../src/logger.js";
import type { QueueTrack } from "./queue.js";

function registerAutoFetchHandler(logger: Logger): void {
	QueueService.setAutoFetchHandler(async (context) => {
		if (context.type !== "radio") return [];
		try {
			const sourceManager = await ensureSourceManager();
			const decoded = decodeId(context.seedId);
			const tracks = await sourceManager.getPlaylistTracks(
				decoded.source,
				decoded.id,
			);
			return tracks.map((t): QueueTrack => ({
				id: encodeId(t.sourceId.source, t.sourceId.id),
				title: t.title,
				artist: t.artist,
				album: t.album,
				duration: t.duration ?? null,
				artworkUrl: t.artworkUrl ?? null,
				source: t.sourceId.source,
			}));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.warn(`Auto-fetch failed: ${msg}`);
			return [];
		}
	});
}

export async function tryAutoLogin(logger: Logger): Promise<void> {
	// Step 1: Migrate legacy credentials to the new source_credentials table
	await migrateLegacyCredentials(logger.log.bind(logger));

	// Step 2: Restore all source sessions from stored credentials
	const restored = await restoreAllSessions(
		logger.log.bind(logger),
		logger.warn.bind(logger),
	);

	if (restored === 0) {
		logger.log("No source credentials to restore");
	}

	// Step 3: Set up global source manager
	const pandoraSession = getPandoraSessionFromCredentials();

	if (pandoraSession) {
		setGlobalSourceManager(await getSourceManager(pandoraSession));
		logger.log("Auto-login successful with Pandora session");
	} else if (restored > 0) {
		logger.log(`Restored ${String(restored)} source session(s) (no Pandora)`);
	}

	// Step 4: Register radio auto-fetch handler
	registerAutoFetchHandler(logger);

	// Step 5: Restore persisted playback state
	try {
		const didRestore = await PlayerService.restoreFromDb();
		if (didRestore) {
			logger.log("Restored playback state from DB");
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.warn(`Failed to restore playback state: ${msg}`);
	}
}
