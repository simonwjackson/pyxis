import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { login } from "../../src/sources/pandora/client.js";
import * as Pandora from "../../src/sources/pandora/client.js";
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
				setGlobalSourceManager(await getSourceManager(session));

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

	settings: protectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getSettings(ctx.pandoraSession),
		);
	}),

	usage: protectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getUsageInfo(ctx.pandoraSession),
		);
	}),

	changeSettings: protectedProcedure
		.input(
			z.object({
				isExplicitContentFilterEnabled: z.boolean().optional(),
				isProfilePrivate: z.boolean().optional(),
				zipCode: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const settings: Record<string, unknown> = {};
			if (input.isExplicitContentFilterEnabled != null) settings.isExplicitContentFilterEnabled = input.isExplicitContentFilterEnabled;
			if (input.isProfilePrivate != null) settings.isProfilePrivate = input.isProfilePrivate;
			if (input.zipCode != null) settings.zipCode = input.zipCode;
			await Effect.runPromise(
				Pandora.changeSettings(ctx.pandoraSession, settings as Parameters<typeof Pandora.changeSettings>[1]),
			);
			return { success: true };
		}),

	setExplicitFilter: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.setExplicitContentFilter(
					ctx.pandoraSession,
					input.enabled,
				),
			);
			return { success: true };
		}),
});
