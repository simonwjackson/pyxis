import { Effect } from "effect";
import { getDb, schema } from "../../src/db/index.js";
import { login } from "../../src/client.js";
import { createSession } from "./session.js";
import { getSourceManager, setGlobalSourceManager } from "./sourceManager.js";
import type { Logger } from "../../src/logger.js";

export async function tryAutoLogin(logger: Logger): Promise<void> {
	const db = await getDb();
	const rows = await db.select().from(schema.credentials).limit(1);
	const creds = rows[0];
	if (!creds) return;

	try {
		const session = await Effect.runPromise(
			login(creds.username, creds.password),
		);
		createSession(session, creds.username);
		setGlobalSourceManager(await getSourceManager(session));
		logger.log(`Auto-login successful for ${creds.username}`);
	} catch {
		logger.warn("Auto-login failed — stored credentials may be stale");
	}
}
