/**
 * @module trpc
 * tRPC server configuration with context factory and middleware.
 * Provides base procedures and authentication middleware for Pandora-protected routes.
 */

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

/**
 * tRPC context available to all procedures.
 * Contains authentication state and source manager for API operations.
 */
export type Context = {
	/** Authenticated Pandora session, undefined if not logged in */
	readonly pandoraSession: PandoraSession | undefined;
	/** Unified source manager for multi-backend operations */
	readonly sourceManager: SourceManager;
};

/**
 * Creates tRPC context for each request.
 * Initializes authentication state and source manager based on stored credentials.
 *
 * @param _req - The incoming HTTP request (unused, auth from stored credentials)
 * @returns Context with Pandora session (if logged in) and source manager
 */
export async function createContext(_req: Request): Promise<Context> {
	const pandoraSession = getPandoraSessionFromCredentials();

	const sourceManager = pandoraSession
		? await getSourceManager(pandoraSession)
		: await ensureSourceManager();

	return { pandoraSession, sourceManager };
}

const t = initTRPC.context<Context>().create();

/** tRPC router factory for creating sub-routers */
export const router = t.router;

/** Base procedure without authentication requirements */
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
