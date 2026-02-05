/**
 * @module session
 * Server-side session management for user authentication and Pandora integration.
 * Sessions are stored in-memory and associate users with their Pandora credentials.
 */

import type { PandoraSession } from "../../src/sources/pandora/client.js";

/**
 * Internal session data structure stored for each authenticated user.
 * Contains the user's identity and optional Pandora authentication state.
 */
type SessionData = {
	/** Authenticated Pandora session, if the user has linked their Pandora account */
	pandoraSession: PandoraSession | undefined;
	/** Username of the authenticated user */
	username: string;
	/** Unix timestamp (ms) when the session was created */
	createdAt: number;
};

const sessions = new Map<string, SessionData>();

function generateSessionId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates a new session for an authenticated user with an auto-generated session ID.
 *
 * @param username - The username of the authenticated user
 * @param pandoraSession - Optional pre-authenticated Pandora session to associate
 * @returns A 64-character hexadecimal session ID
 *
 * @example
 * ```ts
 * const sessionId = createSession("john@example.com");
 * // Returns: "a1b2c3d4..." (64 hex chars)
 * ```
 */
export function createSession(
	username: string,
	pandoraSession?: PandoraSession,
): string {
	const sessionId = generateSessionId();
	sessions.set(sessionId, {
		pandoraSession,
		username,
		createdAt: Date.now(),
	});
	return sessionId;
}

/**
 * Creates a session with a specific session ID, useful for restoring sessions from storage.
 *
 * @param sessionId - The session ID to use (must be unique)
 * @param username - The username of the authenticated user
 * @param pandoraSession - Optional pre-authenticated Pandora session to associate
 *
 * @example
 * ```ts
 * // Restore a session from a cookie
 * createSessionWithId(cookieSessionId, "john@example.com", savedPandoraSession);
 * ```
 */
export function createSessionWithId(
	sessionId: string,
	username: string,
	pandoraSession?: PandoraSession,
): void {
	sessions.set(sessionId, {
		pandoraSession,
		username,
		createdAt: Date.now(),
	});
}

/**
 * Updates the Pandora session for an existing user session.
 * Used when a user authenticates with Pandora after initial login.
 *
 * @param sessionId - The session ID to update
 * @param pandoraSession - The authenticated Pandora session to store
 *
 * @example
 * ```ts
 * const pandoraSession = await authenticatePandora(email, password);
 * updateSessionPandora(sessionId, pandoraSession);
 * ```
 */
export function updateSessionPandora(
	sessionId: string,
	pandoraSession: PandoraSession,
): void {
	const existing = sessions.get(sessionId);
	if (existing) {
		existing.pandoraSession = pandoraSession;
	}
}

/**
 * Retrieves the full session data for a given session ID.
 *
 * @param sessionId - The session ID to look up
 * @returns The session data including username and Pandora session, or undefined if not found
 *
 * @example
 * ```ts
 * const session = getSession(sessionId);
 * if (session) {
 *   console.log(`User: ${session.username}`);
 * }
 * ```
 */
export function getSession(sessionId: string): SessionData | undefined {
	return sessions.get(sessionId);
}

/**
 * Deletes a session, logging the user out.
 *
 * @param sessionId - The session ID to delete
 * @returns True if the session existed and was deleted, false otherwise
 *
 * @example
 * ```ts
 * if (deleteSession(sessionId)) {
 *   console.log("User logged out");
 * }
 * ```
 */
export function deleteSession(sessionId: string): boolean {
	return sessions.delete(sessionId);
}

/**
 * Retrieves only the Pandora session for a given session ID.
 * Convenience method for operations that only need Pandora authentication.
 *
 * @param sessionId - The session ID to look up
 * @returns The authenticated Pandora session, or undefined if not found or not linked
 *
 * @example
 * ```ts
 * const pandora = getPandoraSession(sessionId);
 * if (pandora) {
 *   const stations = await pandora.getStations();
 * }
 * ```
 */
export function getPandoraSession(
	sessionId: string,
): PandoraSession | undefined {
	return sessions.get(sessionId)?.pandoraSession;
}
