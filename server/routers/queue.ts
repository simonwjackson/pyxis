import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import * as QueueService from "../services/queue.js";
import type { QueueState } from "../services/queue.js";

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

	add: protectedProcedure
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
						source: z.enum(["pandora", "ytmusic", "local"]),
					}),
				),
				insertNext: z.boolean().optional(),
			}),
		)
		.mutation(({ input }) => {
			QueueService.addTracks(
				input.tracks,
				input.insertNext,
			);
			return serializeQueueState(QueueService.getState());
		}),

	remove: protectedProcedure
		.input(z.object({ index: z.number() }))
		.mutation(({ input }) => {
			QueueService.removeTrack(input.index);
			return serializeQueueState(QueueService.getState());
		}),

	clear: protectedProcedure.mutation(() => {
		QueueService.clear();
		return serializeQueueState(QueueService.getState());
	}),

	shuffle: protectedProcedure.mutation(() => {
		QueueService.shuffle();
		return serializeQueueState(QueueService.getState());
	}),

	onChange: publicProcedure.subscription(() => {
		return observable<ReturnType<typeof serializeQueueState>>((emit) => {
			emit.next(serializeQueueState(QueueService.getState()));

			const unsubscribe = QueueService.subscribe((state) => {
				emit.next(serializeQueueState(state));
			});

			return unsubscribe;
		});
	}),
});
