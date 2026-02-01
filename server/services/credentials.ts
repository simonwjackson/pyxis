import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../src/db/index.js";
import { login as pandoraLogin } from "../../src/sources/pandora/client.js";
import type { PandoraSession } from "../../src/sources/pandora/client.js";
import type { SourceType } from "../../src/sources/types.js";

type StoredCredential = {
	readonly id: string;
	readonly source: SourceType;
	readonly username: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly hasSession: boolean;
};

type SourceSession =
	| { readonly type: "pandora"; readonly session: PandoraSession }
	| { readonly type: "ytmusic" }
	| { readonly type: "local" };

// In-memory cache of active source sessions keyed by credential ID
const activeSessions = new Map<string, SourceSession>();

function generateCredentialId(source: SourceType, username: string): string {
	return `${source}:${username}`;
}

export async function listCredentials(): Promise<readonly StoredCredential[]> {
	const db = await getDb();
	const rows = await db.select().from(schema.sourceCredentials);
	return rows.map((row) => ({
		id: row.id,
		source: row.source as SourceType,
		username: row.username,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		hasSession: activeSessions.has(row.id),
	}));
}

export async function addCredential(
	source: SourceType,
	username: string,
	password: string,
): Promise<{ readonly id: string; readonly session: SourceSession }> {
	const id = generateCredentialId(source, username);

	// Validate credentials by attempting login
	const session = await loginSource(source, username, password);

	const db = await getDb();
	const now = new Date();
	await db
		.insert(schema.sourceCredentials)
		.values({
			id,
			source,
			username,
			password,
			sessionData: serializeSession(session),
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: schema.sourceCredentials.id,
			set: {
				password,
				sessionData: serializeSession(session),
				updatedAt: now,
			},
		});

	activeSessions.set(id, session);
	return { id, session };
}

export async function removeCredential(id: string): Promise<void> {
	const db = await getDb();
	await db
		.delete(schema.sourceCredentials)
		.where(eq(schema.sourceCredentials.id, id));
	activeSessions.delete(id);
}

export async function testCredential(
	source: SourceType,
	username: string,
	password: string,
): Promise<boolean> {
	try {
		await loginSource(source, username, password);
		return true;
	} catch {
		return false;
	}
}

export function getActiveSession(credentialId: string): SourceSession | undefined {
	return activeSessions.get(credentialId);
}

export function getPandoraSessionFromCredentials(): PandoraSession | undefined {
	for (const session of activeSessions.values()) {
		if (session.type === "pandora") {
			return session.session;
		}
	}
	return undefined;
}

export function getAllActiveSessions(): ReadonlyMap<string, SourceSession> {
	return activeSessions;
}

/**
 * Initialize sessions from stored credentials on startup.
 * Returns the number of successfully restored sessions.
 */
export async function restoreAllSessions(
	log: (msg: string) => void,
	warn: (msg: string) => void,
): Promise<number> {
	const db = await getDb();
	const rows = await db.select().from(schema.sourceCredentials);
	let restored = 0;

	for (const row of rows) {
		try {
			const session = await loginSource(
				row.source as SourceType,
				row.username,
				row.password,
			);
			activeSessions.set(row.id, session);

			// Update session data in DB
			await db
				.update(schema.sourceCredentials)
				.set({
					sessionData: serializeSession(session),
					updatedAt: new Date(),
				})
				.where(eq(schema.sourceCredentials.id, row.id));

			log(`Restored ${row.source} session for ${row.username}`);
			restored++;
		} catch {
			warn(`Failed to restore ${row.source} session for ${row.username}`);
		}
	}

	return restored;
}

/**
 * Migrate legacy credentials (from the old single-credential table)
 * into the new source_credentials table.
 */
export async function migrateLegacyCredentials(
	log: (msg: string) => void,
): Promise<boolean> {
	const db = await getDb();
	const legacyRows = await db.select().from(schema.credentials).limit(1);
	const legacy = legacyRows[0];
	if (!legacy) return false;

	const id = generateCredentialId("pandora", legacy.username);

	// Check if already migrated
	const existing = await db
		.select()
		.from(schema.sourceCredentials)
		.where(eq(schema.sourceCredentials.id, id));
	if (existing[0]) return false;

	const now = new Date();
	await db.insert(schema.sourceCredentials).values({
		id,
		source: "pandora",
		username: legacy.username,
		password: legacy.password,
		createdAt: now,
		updatedAt: now,
	});

	log(`Migrated legacy Pandora credentials for ${legacy.username}`);
	return true;
}

// -- Internal helpers --

async function loginSource(
	source: SourceType,
	username: string,
	password: string,
): Promise<SourceSession> {
	switch (source) {
		case "pandora": {
			const session = await Effect.runPromise(
				pandoraLogin(username, password),
			);
			return { type: "pandora", session };
		}
		case "ytmusic":
			// YTMusic doesn't require authentication credentials
			return { type: "ytmusic" };
		case "local":
			return { type: "local" };
		default: {
			const _exhaustive: never = source;
			throw new Error(`Unknown source type: ${String(_exhaustive)}`);
		}
	}
}

function serializeSession(session: SourceSession): string | null {
	if (session.type === "pandora") {
		return JSON.stringify(session.session);
	}
	return null;
}

export type { StoredCredential, SourceSession };
