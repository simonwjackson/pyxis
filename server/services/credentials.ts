/**
 * @module credentials
 * Pandora credential management and session lifecycle.
 * Stores credentials in memory and handles login/refresh operations.
 */

import { Effect } from "effect";
import { login as pandoraLogin } from "../../src/sources/pandora/client.js";
import type { PandoraSession } from "../../src/sources/pandora/client.js";
import { getPandoraPassword } from "../../src/config.js";
import type { AppConfig } from "../../src/config.js";
import { invalidateManagers, getSourceManager, setGlobalSourceManager } from "./sourceManager.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("server").child({ component: "credentials" });

let pandoraSession: PandoraSession | undefined;
let storedConfig: AppConfig | undefined;

/**
 * Sets the application config reference for credential operations.
 * Used by refreshPandoraSession to retrieve username from config.
 *
 * @param config - Application configuration with Pandora username
 */
export function setCredentialsConfig(config: AppConfig): void {
	storedConfig = config;
}

/**
 * Gets the currently stored Pandora session.
 *
 * @returns The active Pandora session, or undefined if not logged in
 */
export function getPandoraSessionFromCredentials(): PandoraSession | undefined {
	return pandoraSession;
}

/**
 * Sets the Pandora session directly.
 * Used when session is obtained externally (e.g., restored from storage).
 *
 * @param session - Pandora session to store
 */
export function setPandoraSession(session: PandoraSession): void {
	pandoraSession = session;
}

/**
 * Authenticates with Pandora and stores the resulting session.
 *
 * @param username - Pandora account email
 * @param password - Pandora account password
 * @returns The authenticated Pandora session
 * @throws When authentication fails (invalid credentials, network error)
 */
export async function loginPandora(
	username: string,
	password: string,
): Promise<PandoraSession> {
	const session = await Effect.runPromise(pandoraLogin(username, password));
	pandoraSession = session;
	return session;
}

/**
 * Re-authenticate with Pandora using stored config credentials.
 * Invalidates cached source managers and sets the new global manager.
 * Returns the fresh session, or undefined if credentials aren't configured.
 */
export async function refreshPandoraSession(): Promise<PandoraSession | undefined> {
	const username = storedConfig?.sources.pandora.username;
	const password = getPandoraPassword();

	if (!username || !password) {
		log.warn("cannot refresh Pandora session: no credentials configured");
		return undefined;
	}

	log.info("refreshing expired Pandora session");
	const session = await loginPandora(username, password);
	invalidateManagers();
	setGlobalSourceManager(await getSourceManager(session));
	log.info("Pandora session refreshed successfully");
	return session;
}
