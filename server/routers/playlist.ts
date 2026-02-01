import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { encodeId, decodeId, trackCapabilities, playlistCapabilities } from "../lib/ids.js";
import {
	invalidateManagers,
} from "../services/sourceManager.js";
import { ensureSourceManager } from "../services/sourceManager.js";
import { getDb, schema } from "../../src/db/index.js";
import { generateRadioUrl } from "../../src/sources/ytmusic/index.js";
import type { CanonicalTrack, CanonicalPlaylist } from "../../src/sources/types.js";

function encodeTrack(track: CanonicalTrack) {
	const opaqueId = encodeId(track.sourceId.source, track.sourceId.id);
	return {
		id: opaqueId,
		title: track.title,
		artist: track.artist,
		album: track.album,
		...(track.duration != null ? { duration: track.duration } : {}),
		...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
		capabilities: trackCapabilities(track.sourceId.source),
	};
}

function encodePlaylist(playlist: CanonicalPlaylist) {
	return {
		id: encodeId(playlist.source, playlist.id),
		name: playlist.name,
		capabilities: playlistCapabilities(playlist.source),
		...(playlist.description != null
			? { description: playlist.description }
			: {}),
		...(playlist.artworkUrl != null
			? { artworkUrl: playlist.artworkUrl }
			: {}),
	};
}

export const playlistRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const sourceManager = ctx.sourceManager ?? await ensureSourceManager();
		const playlists = await sourceManager.listAllPlaylists();
		return playlists.map(encodePlaylist);
	}),

	getTracks: protectedProcedure
		.input(
			z.object({
				id: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { source, id: playlistId } = decodeId(input.id);
			const sourceManager = ctx.sourceManager ?? await ensureSourceManager();
			const tracks = await sourceManager.getPlaylistTracks(
				source,
				playlistId,
			);
			return tracks.map(encodeTrack);
		}),

	createRadio: publicProcedure
		.input(
			z.object({
				trackId: z.string(),
				name: z.string(),
				artworkUrl: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			// trackId is an opaque ID; decode to get raw ytmusic track ID
			const { id: seedTrackId } = decodeId(input.trackId);
			const db = await getDb();
			const radioUrl = generateRadioUrl(seedTrackId);
			const id = `radio-${seedTrackId}`;

			await db
				.insert(schema.playlists)
				.values({
					id,
					name: input.name,
					source: "ytmusic",
					url: radioUrl,
					isRadio: true,
					seedTrackId,
					...(input.artworkUrl != null
						? { artworkUrl: input.artworkUrl }
						: {}),
				})
				.onConflictDoNothing();

			invalidateManagers();

			return {
				id: encodeId("ytmusic", id),
				url: radioUrl,
			};
		}),
});
