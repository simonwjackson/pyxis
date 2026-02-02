import { Effect } from "effect";
import { login as pandoraLogin } from "../../src/sources/pandora/client.js";
import type { PandoraSession } from "../../src/sources/pandora/client.js";

let pandoraSession: PandoraSession | undefined;

export function getPandoraSessionFromCredentials(): PandoraSession | undefined {
	return pandoraSession;
}

export function setPandoraSession(session: PandoraSession): void {
	pandoraSession = session;
}

export async function loginPandora(
	username: string,
	password: string,
): Promise<PandoraSession> {
	const session = await Effect.runPromise(pandoraLogin(username, password));
	pandoraSession = session;
	return session;
}
