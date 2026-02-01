import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { decodeId, encodeId } from "../lib/ids.js";
import { ensureSourceManager } from "../services/sourceManager.js";

export const artistRouter = router({
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			// Validate the opaque ID is decodable
			decodeId(input.id);
			throw new TRPCError({
				code: "NOT_IMPLEMENTED",
				message: "Artist detail lookup is not yet supported",
			});
		}),

	search: protectedProcedure
		.input(z.object({ query: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const sourceManager = ctx.sourceManager ?? await ensureSourceManager();
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
					id: encodeId(t.sourceId.source, t.sourceId.id),
					name: t.artist,
				}));
			return { artists };
		}),
});
