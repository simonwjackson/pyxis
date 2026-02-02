import { z } from "zod";
import { Effect } from "effect";
import { router, publicProcedure, pandoraProtectedProcedure } from "../trpc.js";
import { encodeId, trackCapabilities } from "../lib/ids.js";
import * as Pandora from "../../src/sources/pandora/client.js";

import type { CanonicalTrack, CanonicalAlbum } from "../../src/sources/types.js";
import type { SearchArtist, SearchGenreStation } from "../../src/sources/pandora/types/api.js";

function encodeTrack(track: CanonicalTrack) {
	return {
		id: encodeId(track.sourceId.source, track.sourceId.id),
		title: track.title,
		artist: track.artist,
		album: track.album,
		...(track.duration != null ? { duration: track.duration } : {}),
		...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
		capabilities: trackCapabilities(track.sourceId.source),
	};
}

function encodeAlbum(album: CanonicalAlbum) {
	const primarySource = album.sourceIds[0];
	return {
		id: primarySource
			? encodeId(primarySource.source, primarySource.id)
			: album.id,
		title: album.title,
		artist: album.artist,
		...(album.year != null ? { year: album.year } : {}),
		...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
		sourceIds: album.sourceIds.map((sid) => encodeId(sid.source, sid.id)),
	};
}

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
