/**
 * @module server/routers/playlist
 * Playlist operations router for listing and managing playlists.
 * Supports both YTMusic playlists stored in the database and
 * creating radio stations from track seeds.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { formatSourceId, parseId, trackCapabilities, playlistCapabilities } from "../lib/ids.js";
import {
	invalidateManagers,
} from "../services/sourceManager.js";

import { getDb, schema } from "../../src/db/index.js";
import { generateRadioUrl } from "../../src/sources/ytmusic/index.js";
import type { CanonicalTrack, CanonicalPlaylist } from "../../src/sources/types.js";

/**
 * Transforms a canonical track into API response format with opaque ID.
 *
 * @param track - The canonical track from the source layer
 * @returns Encoded track object with source-prefixed opaque ID and capabilities
 */
function encodeTrack(track: CanonicalTrack) {
	const opaqueId = formatSourceId(track.sourceId.source, track.sourceId.id);
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

/**
 * Transforms a canonical playlist into API response format.
 *
 * @param playlist - The canonical playlist from the source layer
 * @returns Encoded playlist object with source-prefixed opaque ID
 */
function encodePlaylist(playlist: CanonicalPlaylist) {
	return {
		id: formatSourceId(playlist.source, playlist.id),
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

/**
 * Playlist router providing playlist listing, track retrieval, and radio creation.
 *
 * Endpoints:
 * - `list` - Get all playlists from all connected sources
 * - `getTracks` - Get tracks for a specific playlist
 * - `createRadio` - Create a YTMusic radio station from a track seed
 */
export const playlistRouter = router({
	list: publicProcedure.query(async ({ ctx }) => {
		const sourceManager = ctx.sourceManager;
		const playlists = await sourceManager.listAllPlaylists();
		return playlists.map(encodePlaylist);
	}),

	getTracks: publicProcedure
		.input(
			z.object({
				id: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const parsed = parseId(input.id);
			if (!parsed.source) {
				throw new Error(`Playlist getTracks requires a source-prefixed ID, got: ${input.id}`);
			}
			const sourceManager = ctx.sourceManager;
			const tracks = await sourceManager.getPlaylistTracks(
				parsed.source,
				parsed.id,
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
			const parsed = parseId(input.trackId);
			const seedTrackId = parsed.id;
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
				id: formatSourceId("ytmusic", id),
				url: radioUrl,
			};
		}),
});
