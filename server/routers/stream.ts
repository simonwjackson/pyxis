import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getSourceManager } from "../services/sourceManager.js";
import { parseTrackId, encodeTrackId } from "../services/stream.js";

export const streamRouter = router({
	resolve: publicProcedure
		.input(
			z.object({
				source: z.enum(["pandora", "ytmusic", "local"]),
				trackId: z.string(),
			}),
		)
		.query(({ input }) => {
			const compositeId = encodeTrackId(input.source, input.trackId);
			return {
				streamUrl: `/stream/${encodeURIComponent(compositeId)}`,
				compositeId,
			};
		}),

	info: publicProcedure
		.input(z.object({ compositeId: z.string() }))
		.query(({ input }) => {
			const parsed = parseTrackId(input.compositeId);
			return {
				source: parsed.source,
				trackId: parsed.trackId,
			};
		}),
});
