/**
 * @module server/routers/queue
 * Playback queue management router for track ordering and manipulation.
 * Provides endpoints for queue operations (add, remove, shuffle, jump)
 * and real-time queue state subscriptions via Server-Sent Events.
 */

import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../trpc.js";
import { resolveTrackSource } from "../lib/ids.js";
import * as QueueService from "../services/queue.js";
import type { QueueState } from "../services/queue.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "sse:queue" });

/**
 * Transforms internal queue state into API response format.
 *
 * @param state - Internal queue state from QueueService
 * @returns Serialized queue state for API response
 */
function serializeQueueState(state: QueueState) {
	return {
		items: state.items.map((track) => ({
			id: track.id,
			title: track.title,
			artist: track.artist,
			album: track.album,
			duration: track.duration,
			artworkUrl: track.artworkUrl,
		})),
		currentIndex: state.currentIndex,
		context: state.context,
	};
}

/**
 * Queue router providing playback queue management and state synchronization.
 *
 * Endpoints:
 * - `get` - Get current queue state
 * - `add` - Add tracks to queue (at end or after current)
 * - `remove` - Remove track at specific index
 * - `clear` - Clear all tracks from queue
 * - `jump` - Jump to specific track index
 * - `shuffle` - Randomize queue order (keeps current track first)
 * - `onChange` - SSE subscription for real-time queue updates
 */
export const queueRouter = router({
	get: publicProcedure.query(() => {
		return serializeQueueState(QueueService.getState());
	}),

	add: publicProcedure
		.input(
			z.object({
				tracks: z.array(
					z.object({
						id: z.string(),
						title: z.string(),
						artist: z.string(),
						album: z.string(),
						duration: z.number().nullable(),
						artworkUrl: z.string().nullable(),
					}),
				),
				insertNext: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const tracksWithSource = await Promise.all(
				input.tracks.map(async (track) => ({
					...track,
					source: await resolveTrackSource(track.id),
				})),
			);
			QueueService.addTracks(
				tracksWithSource,
				input.insertNext,
			);
			return serializeQueueState(QueueService.getState());
		}),

	remove: publicProcedure
		.input(z.object({ index: z.number() }))
		.mutation(({ input }) => {
			QueueService.removeTrack(input.index);
			return serializeQueueState(QueueService.getState());
		}),

	clear: publicProcedure.mutation(() => {
		QueueService.clear();
		return serializeQueueState(QueueService.getState());
	}),

	jump: publicProcedure
		.input(z.object({ index: z.number() }))
		.mutation(({ input }) => {
			QueueService.jumpTo(input.index);
			return serializeQueueState(QueueService.getState());
		}),

	shuffle: publicProcedure.mutation(() => {
		QueueService.shuffle();
		return serializeQueueState(QueueService.getState());
	}),

	onChange: publicProcedure.subscription(() => {
		return observable<ReturnType<typeof serializeQueueState>>((emit) => {
			const initial = serializeQueueState(QueueService.getState());
			log.info({ index: initial.currentIndex, len: initial.items.length }, "initial emit");
			emit.next(initial);

			const unsubscribe = QueueService.subscribe((state) => {
				const serialized = serializeQueueState(state);
				log.info({ index: serialized.currentIndex, len: serialized.items.length }, "emit");
				emit.next(serialized);
			});

			return unsubscribe;
		});
	}),
});
