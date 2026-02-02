import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../trpc.js";
import { buildStreamUrl, decodeId } from "../lib/ids.js";
import * as PlayerService from "../services/player.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "sse:player" });

function serializePlayerState(state: PlayerService.PlayerState) {
	const track = state.currentTrack;
	const nextTrack = state.nextTrack;
	return {
		status: state.status,
		currentTrack: track
			? {
					id: track.id,
					title: track.title,
					artist: track.artist,
					album: track.album,
					duration: track.duration,
					artworkUrl: track.artworkUrl,
					streamUrl: buildStreamUrl(track.id, nextTrack?.id),
				}
			: null,
		progress: state.progress,
		duration: state.duration,
		volume: state.volume,
		updatedAt: state.updatedAt,
	};
}

export const playerRouter = router({
	state: publicProcedure.query(() => {
		return serializePlayerState(PlayerService.getState());
	}),

	play: publicProcedure
		.input(
			z
				.object({
					tracks: z
						.array(
							z.object({
								id: z.string(),
								title: z.string(),
								artist: z.string(),
								album: z.string(),
								duration: z.number().nullable(),
								artworkUrl: z.string().nullable(),
							}),
						)
						.optional(),
					context: z
						.discriminatedUnion("type", [
							z.object({ type: z.literal("radio"), seedId: z.string() }),
							z.object({ type: z.literal("album"), albumId: z.string() }),
							z.object({
								type: z.literal("playlist"),
								playlistId: z.string(),
							}),
							z.object({ type: z.literal("manual") }),
						])
						.optional(),
					startIndex: z.number().optional(),
				})
				.optional(),
		)
		.mutation(({ input }) => {
			if (input?.tracks && input.context) {
				const tracksWithSource = input.tracks.map((track) => ({
					...track,
					source: decodeId(track.id).source,
				}));
				PlayerService.play(tracksWithSource, input.context, input.startIndex);
			} else {
				PlayerService.play();
			}
			return serializePlayerState(PlayerService.getState());
		}),

	pause: publicProcedure.mutation(() => {
		PlayerService.pause();
		return serializePlayerState(PlayerService.getState());
	}),

	resume: publicProcedure.mutation(() => {
		PlayerService.resume();
		return serializePlayerState(PlayerService.getState());
	}),

	stop: publicProcedure.mutation(() => {
		PlayerService.stop();
		return serializePlayerState(PlayerService.getState());
	}),

	skip: publicProcedure.mutation(() => {
		PlayerService.skip();
		return serializePlayerState(PlayerService.getState());
	}),

	previous: publicProcedure.mutation(() => {
		PlayerService.previousTrack();
		return serializePlayerState(PlayerService.getState());
	}),

	jumpTo: publicProcedure
		.input(z.object({ index: z.number() }))
		.mutation(({ input }) => {
			PlayerService.jumpToIndex(input.index);
			return serializePlayerState(PlayerService.getState());
		}),

	seek: publicProcedure
		.input(z.object({ position: z.number() }))
		.mutation(({ input }) => {
			PlayerService.seek(input.position);
			return serializePlayerState(PlayerService.getState());
		}),

	volume: publicProcedure
		.input(z.object({ level: z.number().min(0).max(100) }))
		.mutation(({ input }) => {
			PlayerService.setVolume(input.level);
			return serializePlayerState(PlayerService.getState());
		}),

	reportProgress: publicProcedure
		.input(z.object({ progress: z.number() }))
		.mutation(({ input }) => {
			PlayerService.reportProgress(input.progress);
			return { ok: true };
		}),

	reportDuration: publicProcedure
		.input(z.object({ duration: z.number() }))
		.mutation(({ input }) => {
			PlayerService.setDuration(input.duration);
			return { ok: true };
		}),

	trackEnded: publicProcedure.mutation(() => {
		PlayerService.trackEnded();
		return serializePlayerState(PlayerService.getState());
	}),

	onStateChange: publicProcedure.subscription(() => {
		return observable<ReturnType<typeof serializePlayerState>>((emit) => {
			// Send current state immediately
			const initial = serializePlayerState(PlayerService.getState());
			log.info({ status: initial.status, track: initial.currentTrack?.id ?? "none", streamUrl: initial.currentTrack?.streamUrl ?? "none" }, "initial emit");
			emit.next(initial);

			const unsubscribe = PlayerService.subscribe((state) => {
				const serialized = serializePlayerState(state);
				log.info({ status: serialized.status, track: serialized.currentTrack?.id ?? "none", streamUrl: serialized.currentTrack?.streamUrl ?? "none" }, "emit");
				emit.next(serialized);
			});

			return unsubscribe;
		});
	}),
});
