import { getSourceManager, setGlobalSourceManager, ensureSourceManager } from "./sourceManager.js";
import { loginPandora } from "./credentials.js";
import * as PlayerService from "./player.js";
import * as QueueService from "./queue.js";
import { formatSourceId, parseId } from "../lib/ids.js";
import { getPandoraPassword } from "../../src/config.js";
import type { AppConfig } from "../../src/config.js";
import type { Logger } from "../../src/logger.js";
import type { QueueTrack } from "./queue.js";

function registerAutoFetchHandler(logger: Logger): void {
	QueueService.setAutoFetchHandler(async (context) => {
		if (context.type !== "radio") return [];
		try {
			const sourceManager = await ensureSourceManager();
			const parsed = parseId(context.seedId);
			if (!parsed.source) {
				logger.warn({ seedId: context.seedId }, "auto-fetch: seedId has no source prefix");
				return [];
			}
			const tracks = await sourceManager.getPlaylistTracks(
				parsed.source,
				parsed.id,
			);
			return tracks.map((t): QueueTrack => ({
				id: formatSourceId(t.sourceId.source, t.sourceId.id),
				title: t.title,
				artist: t.artist,
				album: t.album,
				duration: t.duration ?? null,
				artworkUrl: t.artworkUrl ?? null,
				source: t.sourceId.source,
			}));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.warn({ err: msg }, "auto-fetch failed");
			return [];
		}
	});
}

export async function tryAutoLogin(logger: Logger, config: AppConfig): Promise<void> {
	const username = config.sources.pandora.username;
	const password = getPandoraPassword();

	if (username && password) {
		try {
			const session = await loginPandora(username, password);
			setGlobalSourceManager(await getSourceManager(session));
			logger.info("auto-login successful with Pandora session");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.warn({ err: msg }, "Pandora auto-login failed");
		}
	} else {
		logger.info("no Pandora credentials configured, skipping auto-login");
	}

	// Register radio auto-fetch handler
	registerAutoFetchHandler(logger);

	// Restore persisted playback state
	try {
		const didRestore = await PlayerService.restoreFromDb();
		if (didRestore) {
			logger.info("restored playback state from DB");
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.warn({ err: msg }, "failed to restore playback state");
	}
}
