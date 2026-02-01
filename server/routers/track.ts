import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { encodeId, decodeId, buildStreamUrl } from "../lib/ids.js";
import * as Pandora from "../../src/sources/pandora/client.js";

export const trackRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			const { source, id } = decodeId(input.id);
			return { source, id, opaqueId: input.id };
		}),

	streamUrl: publicProcedure
		.input(
			z.object({
				id: z.string(),
				nextId: z.string().optional(),
			}),
		)
		.query(({ input }) => {
			return { url: buildStreamUrl(input.id, input.nextId) };
		}),

	feedback: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				radioId: z.string(),
				positive: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id: trackToken } = decodeId(input.id);
			const { id: stationToken } = decodeId(input.radioId);
			const result = await Effect.runPromise(
				Pandora.addFeedback(
					ctx.pandoraSession,
					stationToken,
					trackToken,
					input.positive,
				),
			);
			return {
				feedbackId: encodeId("pandora", result.feedbackId),
				songName: result.songName,
				artistName: result.artistName,
			};
		}),

	removeFeedback: protectedProcedure
		.input(z.object({ feedbackId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: feedbackId } = decodeId(input.feedbackId);
			await Effect.runPromise(
				Pandora.deleteFeedback(ctx.pandoraSession, feedbackId),
			);
			return { success: true };
		}),

	sleep: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: trackToken } = decodeId(input.id);
			await Effect.runPromise(
				Pandora.sleepSong(ctx.pandoraSession, trackToken),
			);
			return { success: true };
		}),

	explain: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const { id: trackToken } = decodeId(input.id);
			return Effect.runPromise(
				Pandora.explainTrack(ctx.pandoraSession, trackToken),
			);
		}),
});
