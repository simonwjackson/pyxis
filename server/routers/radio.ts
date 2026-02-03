import { z } from "zod";
import { Effect } from "effect";
import { router, pandoraProtectedProcedure } from "../trpc.js";
import { formatSourceId, parseId, trackCapabilities } from "../lib/ids.js";
import { getSourceManager, registerPandoraPlaylistItems } from "../services/sourceManager.js";
import { createLogger } from "../../src/logger.js";
import * as Pandora from "../../src/sources/pandora/client.js";
import type { PlaylistItem } from "../../src/sources/pandora/types/api.js";

const log = createLogger("radio").child({ component: "radio" });

function encodePlaylistItem(item: PlaylistItem) {
	if (!item.songName || !item.artistName || !item.albumName) {
		log.warn({
			trackToken: item.trackToken,
			songName: item.songName,
			artistName: item.artistName,
			albumName: item.albumName,
		}, "dropping playlist item with missing metadata");
		return null;
	}

	const opaqueId = formatSourceId("pandora", item.trackToken);
	return {
		id: opaqueId,
		title: item.songName,
		artist: item.artistName,
		album: item.albumName,
		artworkUrl: item.albumArtUrl ?? null,
		capabilities: trackCapabilities("pandora"),
	};
}

export const radioRouter = router({
	list: pandoraProtectedProcedure.query(async ({ ctx }) => {
		const result = await Effect.runPromise(
			Pandora.getStationList(ctx.pandoraSession),
		);
		return result.stations.map((station) => ({
			id: formatSourceId("pandora", station.stationToken),
			stationId: formatSourceId("pandora", station.stationId),
			name: station.stationName,
			isQuickMix: station.isQuickMix ?? false,
			quickMixStationIds: (station.quickMixStationIds ?? []).map(
				(sid) => formatSourceId("pandora", sid),
			),
			allowDelete: station.allowDelete ?? false,
			allowRename: station.allowRename ?? false,
		}));
	}),

	getStation: pandoraProtectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const { id: stationToken } = parseId(input.id);
			const station = await Effect.runPromise(
				Pandora.getStation(ctx.pandoraSession, {
					stationToken,
					includeExtendedAttributes: true,
				}),
			);

			const encodeSeeds = (seeds: ReadonlyArray<{ readonly seedId: string; readonly artistName?: string; readonly songName?: string; readonly musicToken: string }>) =>
				seeds.map((s) => ({
					seedId: formatSourceId("pandora", s.seedId),
					...(s.artistName != null ? { artistName: s.artistName } : {}),
					...(s.songName != null ? { songName: s.songName } : {}),
					musicToken: formatSourceId("pandora", s.musicToken),
				}));

			const encodeFeedback = (items: ReadonlyArray<{ readonly feedbackId: string; readonly songName: string; readonly artistName: string; readonly isPositive: boolean; readonly dateCreated: { readonly time: number } }>) =>
				items.map((fb) => ({
					feedbackId: formatSourceId("pandora", fb.feedbackId),
					songName: fb.songName,
					artistName: fb.artistName,
					isPositive: fb.isPositive,
					dateCreated: fb.dateCreated,
				}));

			return {
				id: input.id,
				name: station.stationName,
				stationId: formatSourceId("pandora", station.stationId),
				music: station.music
					? {
							artists: encodeSeeds(station.music.artists ?? []),
							songs: encodeSeeds(station.music.songs ?? []),
						}
					: undefined,
				feedback: station.feedback
					? {
							thumbsUp: encodeFeedback(
								station.feedback.thumbsUp ?? [],
							),
							thumbsDown: encodeFeedback(
								station.feedback.thumbsDown ?? [],
							),
						}
					: undefined,
			};
		}),

	getTracks: pandoraProtectedProcedure
		.input(
			z.object({
				id: z.string(),
				quality: z
					.enum(["high", "medium", "low"])
					.default("high"),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { id: stationToken } = parseId(input.id);
			const result = await Effect.runPromise(
				Pandora.getPlaylistWithQuality(
					ctx.pandoraSession,
					stationToken,
					input.quality,
				),
			);
		const manager = await getSourceManager(ctx.pandoraSession);
		registerPandoraPlaylistItems(manager, result.items);
		return result.items
			.map(encodePlaylistItem)
			.filter((item): item is NonNullable<ReturnType<typeof encodePlaylistItem>> => item !== null);
		}),

	create: pandoraProtectedProcedure
		.input(
			z.object({
				seedId: z.string().optional(),
				musicToken: z.string().optional(),
				trackToken: z.string().optional(),
				musicType: z.enum(["song", "artist"]).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// seedId is an opaque ID; musicToken/trackToken are raw Pandora tokens from search
			const createInput: Record<string, unknown> = {};
			if (input.musicToken) {
				createInput.musicToken = input.musicToken;
			}
			if (input.trackToken) {
				createInput.trackToken = input.trackToken;
			}
			if (input.musicType) {
				createInput.musicType = input.musicType;
			}
			return Effect.runPromise(
				Pandora.createStation(
					ctx.pandoraSession,
					createInput as Parameters<typeof Pandora.createStation>[1],
				),
			);
		}),

	delete: pandoraProtectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: stationToken } = parseId(input.id);
			await Effect.runPromise(
				Pandora.deleteStation(ctx.pandoraSession, { stationToken }),
			);
			return { success: true };
		}),

	rename: pandoraProtectedProcedure
		.input(z.object({ id: z.string(), name: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: stationToken } = parseId(input.id);
			return Effect.runPromise(
				Pandora.renameStation(ctx.pandoraSession, {
					stationToken,
					stationName: input.name,
				}),
			);
		}),

	genres: pandoraProtectedProcedure.query(async ({ ctx }) => {
		const result = await Effect.runPromise(
			Pandora.getGenreStations(ctx.pandoraSession),
		);
		return result.categories;
	}),

	quickMix: pandoraProtectedProcedure
		.input(z.object({ radioIds: z.array(z.string()) }))
		.mutation(async ({ ctx, input }) => {
			const stationIds = input.radioIds.map(
				(id) => parseId(id).id,
			);
			await Effect.runPromise(
				Pandora.setQuickMix(ctx.pandoraSession, stationIds),
			);
			return { success: true };
		}),

	addSeed: pandoraProtectedProcedure
		.input(
			z.object({
				radioId: z.string(),
				musicToken: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id: stationToken } = parseId(input.radioId);
			return Effect.runPromise(
				Pandora.addMusic(ctx.pandoraSession, {
					stationToken,
					musicToken: input.musicToken,
				}),
			);
		}),

	removeSeed: pandoraProtectedProcedure
		.input(z.object({ radioId: z.string(), seedId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { id: seedId } = parseId(input.seedId);
			await Effect.runPromise(
				Pandora.deleteMusic(ctx.pandoraSession, { seedId }),
			);
			return { success: true };
		}),
});
