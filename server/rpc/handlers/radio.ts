/**
 * @module server/rpc/handlers/radio
 * Effect RPC handlers for the `radio.*` family. Mirrors
 * `server/routers/radio.ts` station lifecycle behavior:
 *
 * - `radio.stations.list`, `radio.station.get`, `radio.stationTracks.get`,
 *   and `radio.genres.list` return read views of Pandora state.
 * - `radio.station.create`, `delete`, `rename`, `quickMix.set`, `seed.add`,
 *   and `seed.remove` are state-changing commands and require the same
 *   Pandora retry posture as the existing routers.
 * - `radio.stationTracks.get` continues to register fetched playlist items
 *   with the Pandora source so subsequent stream URL lookups can resolve
 *   raw track tokens.
 */

import { Effect } from "effect";
import type {
	ApiAddRadioSeedInput,
	ApiCreateStationInput,
	ApiDeleteStationInput,
	ApiGetRadioTracksInput,
	ApiQuickMixInput,
	ApiRadioIdInput,
	ApiRemoveRadioSeedInput,
	ApiRenameStationInput,
} from "../../../src/api/contracts/radio.js";
import { createLogger } from "../../../src/logger.js";
import * as Pandora from "../../../src/sources/pandora/client.js";
import type { PlaylistItem } from "../../../src/sources/pandora/types/api.js";
import { formatSourceId, parseId, trackCapabilities } from "../../lib/ids.js";
import {
	getSourceManager,
	registerPandoraPlaylistItems,
} from "../../services/sourceManager.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import { mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("radio").child({ component: "radio.handler" });

export type RadioHandlerDeps = {
	readonly auth: AuthSessionShape;
};

function encodePlaylistItem(item: PlaylistItem) {
	if (!item.songName || !item.artistName || !item.albumName) {
		log.warn(
			{
				trackToken: item.trackToken,
				songName: item.songName,
				artistName: item.artistName,
				albumName: item.albumName,
			},
			"dropping playlist item with missing metadata",
		);
		return null;
	}
	return {
		id: formatSourceId("pandora", item.trackToken),
		title: item.songName,
		artist: item.artistName,
		album: item.albumName,
		artworkUrl: item.albumArtUrl ?? null,
		capabilities: trackCapabilities("pandora"),
	};
}

export const radioHandlers = (deps: RadioHandlerDeps) => ({
	"radio.stations.list": () =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => Pandora.getStationList(ctx.pandoraSession))
				.pipe(
					Effect.map((result) =>
						result.stations.map((station) => ({
							id: formatSourceId("pandora", station.stationToken),
							stationId: formatSourceId("pandora", station.stationId),
							name: station.stationName,
							isQuickMix: station.isQuickMix ?? false,
							quickMixStationIds: (station.quickMixStationIds ?? []).map(
								(sid) => formatSourceId("pandora", sid),
							),
							allowDelete: station.allowDelete ?? false,
							allowRename: station.allowRename ?? false,
						})),
					),
				),
		),

	"radio.station.get": (payload: ApiRadioIdInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => {
					const { id: stationToken } = parseId(payload.id);
					return Pandora.getStation(ctx.pandoraSession, {
						stationToken,
						includeExtendedAttributes: true,
					});
				})
				.pipe(
					Effect.map((station) => {
						const encodeSeeds = (
							seeds: ReadonlyArray<{
								readonly seedId: string;
								readonly artistName?: string;
								readonly songName?: string;
								readonly musicToken: string;
							}>,
						) =>
							seeds.map((s) => ({
								seedId: formatSourceId("pandora", s.seedId),
								...(s.artistName != null ? { artistName: s.artistName } : {}),
								...(s.songName != null ? { songName: s.songName } : {}),
								musicToken: formatSourceId("pandora", s.musicToken),
							}));

						const encodeFeedback = (
							items: ReadonlyArray<{
								readonly feedbackId: string;
								readonly songName: string;
								readonly artistName: string;
								readonly isPositive: boolean;
								readonly dateCreated: { readonly time: number };
							}>,
						) =>
							items.map((fb) => ({
								feedbackId: formatSourceId("pandora", fb.feedbackId),
								songName: fb.songName,
								artistName: fb.artistName,
								isPositive: fb.isPositive,
								dateCreated: fb.dateCreated,
							}));

						return {
							id: payload.id,
							name: station.stationName,
							stationId: formatSourceId("pandora", station.stationId),
							...(station.music
								? {
										music: {
											artists: encodeSeeds(station.music.artists ?? []),
											songs: encodeSeeds(station.music.songs ?? []),
										},
									}
								: {}),
							...(station.feedback
								? {
										feedback: {
											thumbsUp: encodeFeedback(station.feedback.thumbsUp ?? []),
											thumbsDown: encodeFeedback(
												station.feedback.thumbsDown ?? [],
											),
										},
									}
								: {}),
						};
					}),
				),
		),

	"radio.stationTracks.get": (payload: ApiGetRadioTracksInput) =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) =>
				Effect.gen(function* () {
					const { id: stationToken } = parseId(payload.id);
					const result = yield* Pandora.getPlaylistWithQuality(
						ctx.pandoraSession,
						stationToken,
						payload.quality ?? "high",
					);
					const manager = yield* Effect.tryPromise({
						try: () => getSourceManager(ctx.pandoraSession),
						catch: (cause) => mapUnknownError(cause),
					});
					registerPandoraPlaylistItems(manager, result.items);
					return result.items
						.map(encodePlaylistItem)
						.filter(
							(
								item,
							): item is NonNullable<ReturnType<typeof encodePlaylistItem>> =>
								item !== null,
						);
				}),
			),
		),

	"radio.station.create": (payload: ApiCreateStationInput) =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) => {
				const createInput: Record<string, unknown> = {};
				if (payload.musicToken !== undefined) {
					createInput.musicToken = payload.musicToken;
				}
				if (payload.trackToken !== undefined) {
					createInput.trackToken = payload.trackToken;
				}
				if (payload.musicType !== undefined) {
					createInput.musicType = payload.musicType;
				}
				return Pandora.createStation(
					ctx.pandoraSession,
					createInput as Parameters<typeof Pandora.createStation>[1],
				);
			}),
		),

	"radio.station.delete": (payload: ApiDeleteStationInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => {
					const { id: stationToken } = parseId(payload.id);
					return Pandora.deleteStation(ctx.pandoraSession, { stationToken });
				})
				.pipe(Effect.map(() => ({ success: true as const }))),
		),

	"radio.station.rename": (payload: ApiRenameStationInput) =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) => {
				const { id: stationToken } = parseId(payload.id);
				return Pandora.renameStation(ctx.pandoraSession, {
					stationToken,
					stationName: payload.name,
				});
			}),
		),

	"radio.genres.list": () =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => Pandora.getGenreStations(ctx.pandoraSession))
				.pipe(Effect.map((result) => result.categories)),
		),

	"radio.quickMix.set": (payload: ApiQuickMixInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => {
					const stationIds = payload.radioIds.map((id) => parseId(id).id);
					return Pandora.setQuickMix(ctx.pandoraSession, stationIds);
				})
				.pipe(Effect.map(() => ({ success: true as const }))),
		),

	"radio.seed.add": (payload: ApiAddRadioSeedInput) =>
		publicHandler(
			deps.auth.withAuthRetry((ctx) => {
				const { id: stationToken } = parseId(payload.radioId);
				return Pandora.addMusic(ctx.pandoraSession, {
					stationToken,
					musicToken: payload.musicToken,
				});
			}),
		),

	"radio.seed.remove": (payload: ApiRemoveRadioSeedInput) =>
		publicHandler(
			deps.auth
				.withAuthRetry((ctx) => {
					const { id: seedId } = parseId(payload.seedId);
					return Pandora.deleteMusic(ctx.pandoraSession, { seedId });
				})
				.pipe(Effect.map(() => ({ success: true as const }))),
		),
});
