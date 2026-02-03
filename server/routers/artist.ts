import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { parseId, formatSourceId } from "../lib/ids.js";


export const artistRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			// Artist IDs are encoded track IDs (artist.search derives artists from
			// track results). No dedicated artist API in Pandora or YTMusic.
			const parsed = parseId(input.id);
			return {
				id: input.id,
				name: "Unknown",
				source: parsed.source ?? "unknown",
			};
		}),

	search: publicProcedure
		.input(z.object({ query: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const sourceManager = ctx.sourceManager;
			const results = await sourceManager.searchAll(input.query);
			// Filter to extract artist-like results from tracks (no dedicated artist search yet)
			const seen = new Set<string>();
			const artists = results.tracks
				.filter((t) => {
					if (seen.has(t.artist)) return false;
					seen.add(t.artist);
					return true;
				})
				.map((t) => ({
					id: formatSourceId(t.sourceId.source, t.sourceId.id),
					name: t.artist,
				}));
			return { artists };
		}),
});
