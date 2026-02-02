import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../trpc.js";
import { decodeId } from "../lib/ids.js";
import * as QueueService from "../services/queue.js";
import type { QueueState } from "../services/queue.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback");

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
		.mutation(({ input }) => {
			const tracksWithSource = input.tracks.map((track) => ({
				...track,
				source: decodeId(track.id).source,
			}));
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
			log.log(`[sse:queue] initial emit index=${initial.currentIndex} len=${initial.items.length}`);
			emit.next(initial);

			const unsubscribe = QueueService.subscribe((state) => {
				const serialized = serializeQueueState(state);
				log.log(`[sse:queue] emit index=${serialized.currentIndex} len=${serialized.items.length}`);
				emit.next(serialized);
			});

			return unsubscribe;
		});
	}),
});
