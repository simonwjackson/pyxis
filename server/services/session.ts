import type { PandoraSession } from "../../src/client.js";

type SessionData = {
	pandoraSession: PandoraSession;
	username: string;
	createdAt: number;
};

const sessions = new Map<string, SessionData>();

function generateSessionId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createSession(
	pandoraSession: PandoraSession,
	username: string,
): string {
	const sessionId = generateSessionId();
	sessions.set(sessionId, {
		pandoraSession,
		username,
		createdAt: Date.now(),
	});
	return sessionId;
}

export function createSessionWithId(
	sessionId: string,
	pandoraSession: PandoraSession,
	username: string,
): void {
	sessions.set(sessionId, {
		pandoraSession,
		username,
		createdAt: Date.now(),
	});
}

export function getSession(sessionId: string): SessionData | undefined {
	return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): boolean {
	return sessions.delete(sessionId);
}

export function getPandoraSession(
	sessionId: string,
): PandoraSession | undefined {
	return sessions.get(sessionId)?.pandoraSession;
}
