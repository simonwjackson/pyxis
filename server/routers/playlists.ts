import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { getSourceManager } from "../services/sourceManager.js";

export const playlistsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const sourceManager = getSourceManager(ctx.pandoraSession);
		return sourceManager.listAllPlaylists();
	}),

	getTracks: protectedProcedure
		.input(
			z.object({
				source: z.enum(["pandora", "ytmusic", "local"]),
				playlistId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const sourceManager = getSourceManager(ctx.pandoraSession);
			return sourceManager.getPlaylistTracks(input.source, input.playlistId);
		}),
});
