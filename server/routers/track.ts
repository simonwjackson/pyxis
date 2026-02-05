/**
 * @module server/routers/track
 * Track operations router for retrieving track metadata, streaming URLs,
 * and managing track feedback (thumbs up/down, sleep, explanations).
 */

import { z } from "zod";
import { Effect } from "effect";
import { router, pandoraProtectedProcedure, publicProcedure } from "../trpc.js";
import { formatSourceId, parseId, buildStreamUrl, trackCapabilities, resolveTrackSource } from "../lib/ids.js";
import * as Pandora from "../../src/sources/pandora/client.js";

/**
 * Track router providing track metadata, streaming, and feedback operations.
 *
 * Endpoints:
 * - `get` - Retrieve track metadata and capabilities
 * - `streamUrl` - Generate streaming URL for a track
 * - `feedback` - Add positive/negative feedback to a track
 * - `removeFeedback` - Remove existing feedback
 * - `sleep` - Temporarily hide a track from radio
 * - `explain` - Get explanation of why a track was recommended
 */
export const trackRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const source = await resolveTrackSource(input.id);
			return { id: input.id, capabilities: trackCapabilities(source) };
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

	feedback: pandoraProtectedProcedure
		.input(
			z.object({
				id: z.string(),
				radioId: z.string(),
				positive: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id: trackToken } = parseId(input.id);
			const { id: stationToken } = parseId(input.radioId);
			const result = await Effect.runPromise(
				Pandora.addFeedback(
					ctx.pandoraSession,
					stationToken,
					trackToken,
					input.positive,
				),
			);
			return {
				feedbackId: formatSourceId("pandora", result.feedbackId),
				songName: result.songName,
				artistName: result.artistName,
			};
		}),

	removeFeedback: pandoraProtectedProcedure
		.input(z.object({ feedbackId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: feedbackId } = parseId(input.feedbackId);
			await Effect.runPromise(
				Pandora.deleteFeedback(ctx.pandoraSession, feedbackId),
			);
			return { success: true };
		}),

	sleep: pandoraProtectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: trackToken } = parseId(input.id);
			await Effect.runPromise(
				Pandora.sleepSong(ctx.pandoraSession, trackToken),
			);
			return { success: true };
		}),

	explain: pandoraProtectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const { id: trackToken } = parseId(input.id);
			return Effect.runPromise(
				Pandora.explainTrack(ctx.pandoraSession, trackToken),
			);
		}),
});
