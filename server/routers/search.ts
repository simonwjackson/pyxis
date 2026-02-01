import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/client.js";
import { getSourceManager } from "../services/sourceManager.js";

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

			// Also include Pandora-specific results (artists, genres) not in canonical format
			const pandoraResults = await Effect.runPromise(
				Pandora.search(ctx.pandoraSession, input.query),
			);

			return {
				tracks: results.tracks,
				albums: results.albums,
				pandoraArtists: pandoraResults.artists ?? [],
				pandoraGenres: pandoraResults.genreStations ?? [],
			};
		}),
});
