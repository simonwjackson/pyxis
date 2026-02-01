import { initTRPC, TRPCError } from "@trpc/server";
import { getPandoraSession } from "./services/session.js";
import { getSourceManager, ensureSourceManager } from "./services/sourceManager.js";
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

	const pandoraSession = sessionId
		? getPandoraSession(sessionId)
		: undefined;

	// Full (Pandora + YTMusic) if authenticated, YTMusic-only fallback otherwise
	const sourceManager = pandoraSession
		? await getSourceManager(pandoraSession)
		: await ensureSourceManager();

	return { sessionId, pandoraSession, sourceManager };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.pandoraSession) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated",
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
