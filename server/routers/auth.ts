import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, pandoraProtectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/sources/pandora/client.js";
import { getPandoraSessionFromCredentials } from "../services/credentials.js";

export const authRouter = router({
	status: publicProcedure.query(() => {
		return {
			authenticated: true,
			hasPandora: getPandoraSessionFromCredentials() != null,
		};
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
