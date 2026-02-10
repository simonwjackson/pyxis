/**
 * @module server/routers/player
 * Player control router for playback state management.
 * Provides endpoints for controlling audio playback (play, pause, skip, seek)
 * and real-time state subscriptions via Server-Sent Events.
 */

import { z } from "zod";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../trpc.js";
import { buildStreamUrl, resolveTrackSource } from "../lib/ids.js";
import * as PlayerService from "../services/player.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "sse:player" });

/**
 * Transforms internal player state into API response format.
 * Adds stream URL with prefetch hint for the next track.
 *
 * @param state - Internal player state from PlayerService
 * @returns Serialized player state for API response
 */
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

/**
 * Player router providing playback control and state synchronization.
 *
 * Endpoints:
 * - `state` - Get current player state
 * - `play` - Start playback with optional new tracks and context
 * - `pause` - Pause playback
 * - `resume` - Resume paused playback
 * - `stop` - Stop playback and clear queue
 * - `skip` - Skip to next track
 * - `previous` - Go to previous track
 * - `jumpTo` - Jump to specific queue index
 * - `seek` - Seek to position in current track
 * - `volume` - Set volume level (0-100)
 * - `reportProgress` - Client reports current playback position
 * - `reportDuration` - Client reports actual track duration
 * - `trackEnded` - Client signals track finished playing
 * - `onStateChange` - SSE subscription for real-time state updates
 */
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
		.mutation(async ({ input }) => {
			if (input?.tracks && input.context) {
				const tracksWithSource = await Promise.all(
					input.tracks.map(async (track) => ({
						...track,
						source: await resolveTrackSource(track.id),
					})),
				);
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
