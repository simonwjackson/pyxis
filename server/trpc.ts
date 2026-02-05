import { initTRPC, TRPCError } from "@trpc/server";
import { getSourceManager, ensureSourceManager } from "./services/sourceManager.js";
import { getPandoraSessionFromCredentials, refreshPandoraSession } from "./services/credentials.js";
import { ApiCallError } from "../src/sources/pandora/types/errors.js";
import { createLogger } from "../src/logger.js";
import type { PandoraSession } from "../src/sources/pandora/client.js";
import type { SourceManager } from "../src/sources/index.js";

const log = createLogger("server").child({ component: "trpc" });

/** Pandora error codes that indicate an expired/invalid session */
const AUTH_ERROR_CODES = new Set([0, 1001, 1002]);

function isPandoraAuthError(err: unknown): boolean {
	return err instanceof ApiCallError && err.code != null && AUTH_ERROR_CODES.has(err.code);
}

export type Context = {
	readonly pandoraSession: PandoraSession | undefined;
	readonly sourceManager: SourceManager;
};

export async function createContext(_req: Request): Promise<Context> {
	const pandoraSession = getPandoraSessionFromCredentials();

	const sourceManager = pandoraSession
		? await getSourceManager(pandoraSession)
		: await ensureSourceManager();

	return { pandoraSession, sourceManager };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Pandora-protected procedure — requires a valid Pandora session specifically.
 * Used by endpoints that call Pandora APIs directly.
 *
 * On auth errors (expired session), automatically re-logins with stored
 * credentials and retries the handler once with a fresh session.
 */
export const pandoraProtectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.pandoraSession) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Pandora credentials required",
		});
	}

	try {
		return await next({
			ctx: {
				...ctx,
				pandoraSession: ctx.pandoraSession,
				sourceManager: ctx.sourceManager,
			},
		});
	} catch (err) {
		if (!isPandoraAuthError(err)) throw err;

		log.warn({ code: (err as ApiCallError).code }, "Pandora auth error detected, attempting session refresh");

		const freshSession = await refreshPandoraSession();
		if (!freshSession) throw err;

		const freshManager = await getSourceManager(freshSession);

		return next({
			ctx: {
				...ctx,
				pandoraSession: freshSession,
				sourceManager: freshManager,
			},
		});
	}
});
