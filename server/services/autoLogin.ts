/**
 * @module autoLogin
 * Server startup initialization handling auto-login, state restoration, and auto-fetch registration.
 * Called once during server boot to set up Pandora session and restore playback state.
 */

import { getSourceManager, setGlobalSourceManager, ensureSourceManager } from "./sourceManager.js";
import { loginPandora, refreshPandoraSession } from "./credentials.js";
import { ApiCallError } from "../../src/sources/pandora/types/errors.js";
import * as PlayerService from "./player.js";
import * as QueueService from "./queue.js";
import { formatSourceId, parseId } from "../lib/ids.js";
import { getPandoraPassword } from "../../src/config.js";
import type { AppConfig } from "../../src/config.js";
import type { Logger } from "../../src/logger.js";
import type { QueueTrack } from "./queue.js";
import type { SourceType } from "../../src/sources/types.js";

/** Pandora error codes that indicate an expired/invalid session */
const AUTH_ERROR_CODES = new Set([0, 1001, 1002]);

/**
 * Checks if an error is a Pandora authentication error requiring session refresh.
 *
 * @param err - Error to check
 * @returns True if error indicates expired/invalid Pandora session
 */
function isPandoraAuthError(err: unknown): boolean {
	return err instanceof ApiCallError && err.code != null && AUTH_ERROR_CODES.has(err.code);
}

/**
 * Converts source layer tracks to queue-compatible track format.
 *
 * @param tracks - Tracks from source layer with sourceId structure
 * @returns Array of QueueTrack objects with flattened IDs
 */
function mapTracksToQueue(tracks: ReadonlyArray<{ readonly sourceId: { readonly source: SourceType; readonly id: string }; readonly title: string; readonly artist: string; readonly album: string; readonly duration?: number | null; readonly artworkUrl?: string | null }>): QueueTrack[] {
	return tracks.map((t): QueueTrack => ({
		id: formatSourceId(t.sourceId.source, t.sourceId.id),
		title: t.title,
		artist: t.artist,
		album: t.album,
		duration: t.duration ?? null,
		artworkUrl: t.artworkUrl ?? null,
		source: t.sourceId.source,
	}));
}

/**
 * Fetches tracks for a playlist/radio station from the source manager.
 *
 * @param source - Source type (pandora, ytmusic, etc.)
 * @param id - Source-specific playlist/station ID
 * @returns Array of tracks in queue format
 */
async function fetchPlaylistTracks(
	source: SourceType,
	id: string,
): Promise<QueueTrack[]> {
	const sourceManager = await ensureSourceManager();
	const tracks = await sourceManager.getPlaylistTracks(source, id);
	return mapTracksToQueue(tracks);
}

/**
 * Registers the radio auto-fetch handler for queue track replenishment.
 * When playing a radio station, automatically fetches more tracks when
 * the queue runs low. Handles session refresh on Pandora auth errors.
 *
 * @param logger - Logger for status and error messages
 */
function registerAutoFetchHandler(logger: Logger): void {
	QueueService.setAutoFetchHandler(async (context) => {
		if (context.type !== "radio") return [];
		const parsed = parseId(context.seedId);
		if (!parsed.source) {
			logger.warn({ seedId: context.seedId }, "auto-fetch: seedId has no source prefix");
			return [];
		}

		try {
			return await fetchPlaylistTracks(parsed.source, parsed.id);
		} catch (err: unknown) {
			if (!isPandoraAuthError(err)) {
				const msg = err instanceof Error ? err.message : String(err);
				logger.warn({ err: msg }, "auto-fetch failed");
				return [];
			}

			logger.warn({ code: (err as ApiCallError).code }, "auto-fetch: Pandora auth error, refreshing session");
			try {
				const freshSession = await refreshPandoraSession();
				if (!freshSession) return [];
				return await fetchPlaylistTracks(parsed.source, parsed.id);
			} catch (retryErr: unknown) {
				const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
				logger.error({ err: msg }, "auto-fetch: retry after session refresh failed");
				return [];
			}
		}
	});
}

/**
 * Attempts auto-login on server startup using configured credentials.
 * Sets up radio auto-fetch handler and restores persisted playback state.
 * Continues gracefully if login fails or credentials aren't configured.
 *
 * @param logger - Logger for status messages
 * @param config - Application configuration with Pandora credentials
 */
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
