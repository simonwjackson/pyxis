import { initTRPC, TRPCError } from "@trpc/server";
import { getPandoraSession } from "./services/session.js";
import type { PandoraSession } from "../src/client.js";

export type Context = {
	sessionId: string | undefined;
	pandoraSession: PandoraSession | undefined;
};

export function createContext(req: Request): Context {
	const cookies = req.headers.get("cookie") ?? "";
	const sessionId = cookies
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith("pyxis_session="))
		?.split("=")[1];

	const pandoraSession = sessionId
		? getPandoraSession(sessionId)
		: undefined;

	return { sessionId, pandoraSession };
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
		},
	});
});
