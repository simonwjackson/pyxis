import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import { encodeId } from "../lib/ids.js";
import * as Pandora from "../../src/sources/pandora/client.js";
import { getSourceManager } from "../services/sourceManager.js";
import type { CanonicalTrack, CanonicalAlbum } from "../../src/sources/types.js";

function encodeTrack(track: CanonicalTrack) {
	return {
		id: encodeId(track.sourceId.source, track.sourceId.id),
		title: track.title,
		artist: track.artist,
		album: track.album,
		...(track.duration != null ? { duration: track.duration } : {}),
		...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
		source: track.sourceId.source,
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
		sourceIds: album.sourceIds.map((sid) => ({
			id: encodeId(sid.source, sid.id),
			source: sid.source,
		})),
	};
}

export const searchRouter = router({
	search: protectedProcedure
		.input(z.object({ searchText: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.search(ctx.pandoraSession, input.searchText),
			);
		}),

	unified: protectedProcedure
		.input(z.object({ query: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const sourceManager = await getSourceManager(ctx.pandoraSession);
			const results = await sourceManager.searchAll(input.query);

			const pandoraResults = await Effect.runPromise(
				Pandora.search(ctx.pandoraSession, input.query),
			);

			return {
				tracks: results.tracks.map(encodeTrack),
				albums: results.albums.map(encodeAlbum),
				pandoraArtists: pandoraResults.artists ?? [],
				pandoraGenres: pandoraResults.genreStations ?? [],
			};
		}),
});
