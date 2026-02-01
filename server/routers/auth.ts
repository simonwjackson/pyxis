import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, pandoraProtectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/sources/pandora/client.js";
import {
	createSession,
	deleteSession,
	getSession,
} from "../services/session.js";
import {
	addCredential,
} from "../services/credentials.js";
import { getSourceManager, setGlobalSourceManager, ensureSourceManager } from "../services/sourceManager.js";
import { getDb, schema } from "../../src/db/index.js";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
	/**
	 * Login to Pyxis. Accepts Pandora credentials.
	 * Creates a Pyxis session and stores the source credential.
	 */
	login: publicProcedure
		.input(
			z.object({
				username: z.string().email(),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				// Validate and store via credential service
				const { session } = await addCredential(
					"pandora",
					input.username,
					input.password,
				);

				let pandoraSession: Pandora.PandoraSession | undefined;
				if (session.type === "pandora") {
					pandoraSession = session.session;
				}

				// Create a Pyxis-level session
				const sessionId = createSession(input.username, pandoraSession);

				// Update global source manager with authenticated sources
				if (pandoraSession) {
					setGlobalSourceManager(await getSourceManager(pandoraSession));
				}

				// Also maintain legacy credentials table for backwards compat during migration
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

	/**
	 * Create a session without Pandora credentials.
	 * Enables YTMusic-only usage.
	 */
	guestLogin: publicProcedure.mutation(async () => {
		const sessionId = createSession("guest");

		// Initialize source manager with YTMusic only
		await ensureSourceManager();

		return { sessionId, username: "guest" };
	}),

	logout: publicProcedure.mutation(async ({ ctx }) => {
		if (ctx.sessionId) {
			deleteSession(ctx.sessionId);
		}

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

	settings: pandoraProtectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getSettings(ctx.pandoraSession),
		);
	}),

	usage: pandoraProtectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getUsageInfo(ctx.pandoraSession),
		);
	}),

	changeSettings: pandoraProtectedProcedure
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

	setExplicitFilter: pandoraProtectedProcedure
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
