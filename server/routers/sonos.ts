import { TRPCError } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import * as SonosDiscovery from "../services/sonos-discovery.js";
import * as SonosControl from "../services/sonos-control.js";
import * as SonosPlayback from "../services/sonos-playback.js";
import * as PlayerService from "../services/player.js";
import * as QueueService from "../services/queue.js";
import { buildExternalStreamUrl, resolveExternalBaseUrl } from "../services/external-url.js";
import { getAppConfig } from "../services/sourceManager.js";
import {
	SonosControlError,
	SonosDiscoveryError,
	SonosNotFoundError,
} from "../services/sonos-errors.js";

function asTrpcError(err: unknown): TRPCError {
	if (err instanceof SonosNotFoundError) {
		return new TRPCError({ code: "NOT_FOUND", message: err.message });
	}
	if (err instanceof SonosDiscoveryError) {
		return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
	}
	if (err instanceof SonosControlError) {
		return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: err instanceof Error ? err.message : "Sonos operation failed",
	});
}

type QueueTrack = QueueService.QueueTrack;

function isSonosEnabled(): boolean {
	return getAppConfig()?.sonos.enabled !== false;
}

function requireSonosEnabled(): void {
	if (!isSonosEnabled()) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Sonos integration is disabled in config",
		});
	}
}

function resolveTrackForCast(trackId?: string): QueueTrack | undefined {
	if (trackId) {
		const fromQueue = QueueService.getState().items.find((track) => track.id === trackId);
		if (fromQueue) return fromQueue;
		const current = PlayerService.getState().currentTrack;
		return current?.id === trackId ? current : undefined;
	}
	const current = PlayerService.getState().currentTrack;
	return current ?? undefined;
}

async function enrichSpeakerState(speaker: SonosDiscovery.SonosSpeaker, streamPrefix: string) {
	let playbackState: SonosControl.SonosPlaybackState | null = null;
	let volume: number | null = null;
	let currentUri: string | null = null;
	try {
		playbackState = await Effect.runPromise(SonosControl.getPlaybackState(speaker.uuid));
	} catch {
		playbackState = null;
	}
	try {
		volume = await Effect.runPromise(SonosControl.getVolume(speaker.uuid));
	} catch {
		volume = null;
	}
	try {
		currentUri = await Effect.runPromise(SonosControl.getCurrentUri(speaker.uuid));
	} catch {
		currentUri = null;
	}

	return {
		...speaker,
		playbackState,
		volume,
		currentUri,
		isPyxisStream: currentUri != null && currentUri.startsWith(streamPrefix),
		isActiveCastTarget: SonosPlayback.getActiveSpeakers().includes(speaker.uuid),
	};
}

export const sonosRouter = router({
	speakers: router({
		list: publicProcedure.query(async () => {
			if (!isSonosEnabled()) return [];
			try {
				const speakers = await Effect.runPromise(SonosDiscovery.discoverSpeakers());
				const streamPrefix = `${resolveExternalBaseUrl()}/stream/`;
				return Promise.all(
					speakers.map((speaker) => enrichSpeakerState(speaker, streamPrefix)),
				);
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

		get: publicProcedure
			.input(z.object({ uuid: z.string() }))
			.query(async ({ input }) => {
				requireSonosEnabled();
				try {
					const speaker = await Effect.runPromise(SonosDiscovery.getSpeaker(input.uuid));
					const streamPrefix = `${resolveExternalBaseUrl()}/stream/`;
					return enrichSpeakerState(speaker, streamPrefix);
				} catch (err) {
					throw asTrpcError(err);
				}
			}),
	}),

	playTo: publicProcedure
		.input(
			z.object({
				speakerUuids: z.array(z.string()).min(1),
				trackId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			const track = resolveTrackForCast(input.trackId);
			if (!track) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No track available to cast",
				});
			}

			try {
				if (input.trackId) {
					const queue = QueueService.getState();
					const trackIndex = queue.items.findIndex((item) => item.id === input.trackId);
					const currentTrackId = PlayerService.getState().currentTrack?.id;
					if (trackIndex >= 0 && currentTrackId !== input.trackId) {
						PlayerService.jumpToIndex(trackIndex);
					}
				}

				const playerState = PlayerService.getState();
				if (playerState.status === "paused") {
					PlayerService.resume();
				}

				await SonosPlayback.activateSpeakers(input.speakerUuids);
				const streamUrl = buildExternalStreamUrl(track.id);
				return { ok: true, streamUrl };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	stop: publicProcedure
		.input(z.object({ speakerUuids: z.array(z.string()).min(1) }))
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			try {
				await SonosPlayback.deactivateSpeakers(input.speakerUuids);
				await Promise.all(
					input.speakerUuids.map((speakerUuid) =>
						Effect.runPromise(SonosControl.stop(speakerUuid)),
					),
				);
				return { ok: true };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	pause: publicProcedure
		.input(z.object({ speakerUuids: z.array(z.string()).min(1) }))
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			try {
				await Promise.all(
					input.speakerUuids.map((speakerUuid) =>
						Effect.runPromise(SonosControl.pause(speakerUuid)),
					),
				);
				return { ok: true };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	next: publicProcedure
		.input(z.object({ speakerUuids: z.array(z.string()).min(1) }))
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			try {
				await Promise.all(
					input.speakerUuids.map((speakerUuid) =>
						Effect.runPromise(SonosControl.next(speakerUuid)),
					),
				);
				return { ok: true };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	previous: publicProcedure
		.input(z.object({ speakerUuids: z.array(z.string()).min(1) }))
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			try {
				await Promise.all(
					input.speakerUuids.map((speakerUuid) =>
						Effect.runPromise(SonosControl.previous(speakerUuid)),
					),
				);
				return { ok: true };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	seek: publicProcedure
		.input(
			z.object({
				speakerUuids: z.array(z.string()).min(1),
				position: z.number().min(0),
			}),
		)
		.mutation(async ({ input }) => {
			requireSonosEnabled();
			try {
				await Promise.all(
					input.speakerUuids.map((speakerUuid) =>
						Effect.runPromise(
							SonosControl.seek(speakerUuid, input.position),
						),
					),
				);
				return { ok: true };
			} catch (err) {
				throw asTrpcError(err);
			}
		}),

	volume: router({
		get: publicProcedure
			.input(z.object({ speakerUuid: z.string() }))
			.query(async ({ input }) => {
				requireSonosEnabled();
				try {
					const volume = await Effect.runPromise(
						SonosControl.getVolume(input.speakerUuid),
					);
					return { volume };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),

		set: publicProcedure
			.input(
				z.object({
					speakerUuid: z.string(),
					volume: z.number().min(0).max(100),
				}),
			)
			.mutation(async ({ input }) => {
				requireSonosEnabled();
				try {
					await Effect.runPromise(
						SonosControl.setVolume(input.speakerUuid, input.volume),
					);
					return { ok: true };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),

		getGroup: publicProcedure
			.input(z.object({ coordinatorUuid: z.string() }))
			.query(async ({ input }) => {
				requireSonosEnabled();
				try {
					const volume = await Effect.runPromise(
						SonosControl.getGroupVolume(input.coordinatorUuid),
					);
					return { volume };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),

		setGroup: publicProcedure
			.input(
				z.object({
					coordinatorUuid: z.string(),
					volume: z.number().min(0).max(100),
				}),
			)
			.mutation(async ({ input }) => {
				requireSonosEnabled();
				try {
					await Effect.runPromise(
						SonosControl.setGroupVolume(
							input.coordinatorUuid,
							input.volume,
						),
					);
					return { ok: true };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),
	}),

	group: router({
		join: publicProcedure
			.input(
				z.object({
					speakerUuid: z.string(),
					coordinatorUuid: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				requireSonosEnabled();
				try {
					await Effect.runPromise(
						SonosControl.joinGroup(input.speakerUuid, input.coordinatorUuid),
					);
					return { ok: true };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),

		leave: publicProcedure
			.input(z.object({ speakerUuid: z.string() }))
			.mutation(async ({ input }) => {
				requireSonosEnabled();
				try {
					await Effect.runPromise(SonosControl.leaveGroup(input.speakerUuid));
					return { ok: true };
				} catch (err) {
					throw asTrpcError(err);
				}
			}),
	}),
});
