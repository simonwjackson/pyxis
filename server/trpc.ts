import { initTRPC, TRPCError } from "@trpc/server";
import { getSession, getPandoraSession } from "./services/session.js";
import { getSourceManager, ensureSourceManager } from "./services/sourceManager.js";
import { getPandoraSessionFromCredentials } from "./services/credentials.js";
import type { PandoraSession } from "../src/sources/pandora/client.js";
import type { SourceManager } from "../src/sources/index.js";

export type Context = {
	readonly sessionId: string | undefined;
	readonly pandoraSession: PandoraSession | undefined;
	readonly sourceManager: SourceManager | undefined;
};

export async function createContext(req: Request): Promise<Context> {
	const cookies = req.headers.get("cookie") ?? "";
	const sessionId = cookies
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith("pyxis_session="))
		?.split("=")[1];

	// Try to get Pandora session from the user's session first,
	// then fall back to credential service's active sessions
	const pandoraSession = sessionId
		? (getPandoraSession(sessionId) ?? getPandoraSessionFromCredentials())
		: getPandoraSessionFromCredentials();

	// Full (Pandora + YTMusic) if authenticated, YTMusic-only fallback otherwise
	const sourceManager = pandoraSession
		? await getSourceManager(pandoraSession)
		: await ensureSourceManager();

	return { sessionId, pandoraSession, sourceManager };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires a valid Pyxis session (not necessarily Pandora).
 * Pandora session may be undefined if the user only has YTMusic credentials.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.sessionId || !getSession(ctx.sessionId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated",
		});
	}
	return next({
		ctx: {
			...ctx,
			sessionId: ctx.sessionId,
			sourceManager: ctx.sourceManager!,
		},
	});
});

/**
 * Pandora-protected procedure — requires a valid Pandora session specifically.
 * Used by endpoints that call Pandora APIs directly.
 */
export const pandoraProtectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.pandoraSession) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Pandora credentials required",
		});
	}
	return next({
		ctx: {
			...ctx,
			pandoraSession: ctx.pandoraSession,
			sessionId: ctx.sessionId!,
			sourceManager: ctx.sourceManager!,
		},
	});
});
