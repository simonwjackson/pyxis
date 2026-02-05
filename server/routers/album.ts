/**
 * @module server/routers/album
 * Album operations router for retrieving album metadata and track listings.
 * Supports multiple music sources through the unified SourceManager abstraction.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { formatSourceId, parseId } from "../lib/ids.js";
import { ensureSourceManager } from "../services/sourceManager.js";
import type { CanonicalTrack } from "../../src/sources/types.js";

/**
 * Transforms a canonical track into API response format with opaque ID.
 * @param track - The canonical track from the source layer
 * @returns Encoded track object with source-prefixed opaque ID
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
	};
}

/**
 * Album router providing album metadata and track listing operations.
 *
 * Endpoints:
 * - `get` - Retrieve album metadata (title, artist, year, artwork)
 * - `tracks` - Get all tracks belonging to an album
 */
export const albumRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const parsed = parseId(input.id);
			if (!parsed.source) {
				throw new Error(`Album get requires a source-prefixed ID, got: ${input.id}`);
			}
			const sourceManager = await ensureSourceManager();
			const { album } = await sourceManager.getAlbumTracks(parsed.source, parsed.id);
			return {
				id: input.id,
				title: album.title,
				artist: album.artist,
				...(album.year != null ? { year: album.year } : {}),
				...(album.artworkUrl != null
					? { artworkUrl: album.artworkUrl }
					: {}),
			};
		}),

	tracks: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const parsed = parseId(input.id);
			if (!parsed.source) {
				throw new Error(`Album tracks requires a source-prefixed ID, got: ${input.id}`);
			}
			const sourceManager = await ensureSourceManager();
			const { tracks } = await sourceManager.getAlbumTracks(parsed.source, parsed.id);
			return tracks.map(encodeTrack);
		}),
});
