import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/client.js";

export const userRouter = router({
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
			await Effect.runPromise(
				Pandora.changeSettings(ctx.pandoraSession, input),
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
