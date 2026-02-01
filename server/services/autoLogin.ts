import { getDb, schema } from "../../src/db/index.js";
import { createSessionWithId, createSession } from "./session.js";
import { getSourceManager, setGlobalSourceManager } from "./sourceManager.js";
import {
	migrateLegacyCredentials,
	restoreAllSessions,
	getPandoraSessionFromCredentials,
} from "./credentials.js";
import type { Logger } from "../../src/logger.js";

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
		return;
	}

	// Step 3: Create a Pyxis session if we have Pandora credentials
	const pandoraSession = getPandoraSessionFromCredentials();

	// Read legacy credentials table for session ID continuity
	const db = await getDb();
	const legacyRows = await db.select().from(schema.credentials).limit(1);
	const legacy = legacyRows[0];

	if (legacy?.sessionId) {
		createSessionWithId(legacy.sessionId, legacy.username, pandoraSession);
	} else if (legacy) {
		createSession(legacy.username, pandoraSession);
	}

	// Step 4: Set up global source manager
	if (pandoraSession) {
		setGlobalSourceManager(await getSourceManager(pandoraSession));
		logger.log("Auto-login successful with Pandora session");
	} else {
		logger.log(`Restored ${String(restored)} source session(s) (no Pandora)`);
	}
}
