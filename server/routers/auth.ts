import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { login } from "../../src/client.js";
import {
	createSession,
	deleteSession,
	getSession,
} from "../services/session.js";
import { getSourceManager, setGlobalSourceManager } from "../services/sourceManager.js";
import { getDb, schema } from "../../src/db/index.js";
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
				// Initialize source manager for stream endpoint
				setGlobalSourceManager(await getSourceManager(session));

				// Persist credentials + session ID for auto-login after restart
				const db = await getDb();
				await db
					.insert(schema.credentials)
					.values({
						id: "default",
						username: input.username,
						password: input.password,
						sessionId,
					})
					.onConflictDoUpdate({
						target: schema.credentials.id,
						set: {
							username: input.username,
							password: input.password,
							sessionId,
						},
					});

				return { sessionId, username: input.username };
			} catch {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Invalid credentials",
				});
			}
		}),

	logout: protectedProcedure.mutation(async ({ ctx }) => {
		deleteSession(ctx.sessionId);

		// Clear stored credentials so next restart requires manual login
		const db = await getDb();
		await db.delete(schema.credentials);

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
