import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { login } from "../../src/client.js";
import {
	createSession,
	deleteSession,
	getSession,
} from "../services/session.js";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
	login: publicProcedure
		.input(
			z.object({
				username: z.string().email(),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const session = await Effect.runPromise(
					login(input.username, input.password),
				);
				const sessionId = createSession(session, input.username);
				return { sessionId, username: input.username };
			} catch (error) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Invalid credentials",
				});
			}
		}),

	logout: protectedProcedure.mutation(({ ctx }) => {
		deleteSession(ctx.sessionId);
		return { success: true };
	}),

	status: publicProcedure.query(({ ctx }) => {
		if (!ctx.sessionId) {
			return { authenticated: false, username: undefined };
		}
		const session = getSession(ctx.sessionId);
		if (!session) {
			return { authenticated: false, username: undefined };
		}
		return { authenticated: true, username: session.username };
	}),
});
