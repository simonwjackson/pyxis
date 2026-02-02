import { initTRPC, TRPCError } from "@trpc/server";
import { getSourceManager, ensureSourceManager } from "./services/sourceManager.js";
import { getPandoraSessionFromCredentials } from "./services/credentials.js";
import type { PandoraSession } from "../src/sources/pandora/client.js";
import type { SourceManager } from "../src/sources/index.js";

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
			sourceManager: ctx.sourceManager,
		},
	});
});
