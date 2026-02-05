/**
 * @module server/routers/search
 * Search operations router for querying tracks, albums, and artists
 * across multiple music sources. Supports both Pandora-specific search
 * and unified cross-source search.
 */

import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, pandoraProtectedProcedure } from "../trpc.js";
import { formatSourceId, trackCapabilities } from "../lib/ids.js";
import * as Pandora from "../../src/sources/pandora/client.js";

import type { CanonicalTrack, CanonicalAlbum } from "../../src/sources/types.js";
import type { SearchArtist, SearchGenreStation } from "../../src/sources/pandora/types/api.js";

/**
 * Transforms a canonical track into API response format with opaque ID.
 * @param track - The canonical track from the source layer
 * @returns Encoded track object with source-prefixed opaque ID and capabilities
 */
function encodeTrack(track: CanonicalTrack) {
	return {
		id: formatSourceId(track.sourceId.source, track.sourceId.id),
		title: track.title,
		artist: track.artist,
		album: track.album,
		...(track.duration != null ? { duration: track.duration } : {}),
		...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
		capabilities: trackCapabilities(track.sourceId.source),
	};
}

/**
 * Transforms a canonical album into API response format with opaque IDs.
 * @param album - The canonical album from the source layer
 * @returns Encoded album object with source-prefixed opaque ID and metadata
 */
function encodeAlbum(album: CanonicalAlbum) {
	const primarySource = album.sourceIds[0];
	return {
		id: primarySource
			? formatSourceId(primarySource.source, primarySource.id)
			: album.id,
		title: album.title,
		artist: album.artist,
		...(album.year != null ? { year: album.year } : {}),
		...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
		sourceIds: album.sourceIds.map((sid) => formatSourceId(sid.source, sid.id)),
		...(album.genres != null && album.genres.length > 0
			? { genres: album.genres }
			: {}),
		...(album.releaseType != null ? { releaseType: album.releaseType } : {}),
	};
}

/**
 * Search router providing music search across multiple sources.
 *
 * Endpoints:
 * - `search` - Pandora-only search returning raw Pandora results
 * - `unified` - Cross-source search aggregating tracks, albums, and Pandora-specific results
 */
export const searchRouter = router({
	search: pandoraProtectedProcedure
		.input(z.object({ searchText: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.search(ctx.pandoraSession, input.searchText),
			);
		}),

	unified: publicProcedure
		.input(z.object({ query: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const sourceManager = ctx.sourceManager;
			const results = await sourceManager.searchAll(input.query);

			// Include Pandora-specific results if session is available
			let pandoraArtists: readonly SearchArtist[] = [];
			let pandoraGenres: readonly SearchGenreStation[] = [];
			if (ctx.pandoraSession) {
				const pandoraResults = await Effect.runPromise(
					Pandora.search(ctx.pandoraSession, input.query),
				);
				pandoraArtists = pandoraResults.artists ?? [];
				pandoraGenres = pandoraResults.genreStations ?? [];
			}

			return {
				tracks: results.tracks.map(encodeTrack),
				albums: results.albums.map(encodeAlbum),
				pandoraArtists,
				pandoraGenres,
			};
		}),
});
