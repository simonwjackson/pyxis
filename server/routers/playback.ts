import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/client.js";

export const playbackRouter = router({
	getPlaylist: protectedProcedure
		.input(
			z.object({
				stationToken: z.string(),
				quality: z.enum(["high", "medium", "low"]).default("high"),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await Effect.runPromise(
				Pandora.getPlaylistWithQuality(
					ctx.pandoraSession,
					input.stationToken,
					input.quality,
				),
			);
			return result.items;
		}),

	addFeedback: protectedProcedure
		.input(
			z.object({
				stationToken: z.string(),
				trackToken: z.string(),
				isPositive: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.addFeedback(
					ctx.pandoraSession,
					input.stationToken,
					input.trackToken,
					input.isPositive,
				),
			);
		}),

	deleteFeedback: protectedProcedure
		.input(z.object({ feedbackId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.deleteFeedback(ctx.pandoraSession, input.feedbackId),
			);
			return { success: true };
		}),

	sleepSong: protectedProcedure
		.input(z.object({ trackToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.sleepSong(ctx.pandoraSession, input.trackToken),
			);
			return { success: true };
		}),

	explainTrack: protectedProcedure
		.input(z.object({ trackToken: z.string() }))
		.query(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.explainTrack(ctx.pandoraSession, input.trackToken),
			);
		}),
});
