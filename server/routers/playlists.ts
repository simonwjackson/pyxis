import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import {
	getSourceManager,
	invalidateManagers,
} from "../services/sourceManager.js";
import { getDb, schema } from "../../src/db/index.js";
import { generateRadioUrl } from "../../src/sources/ytmusic/index.js";

export const playlistsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const sourceManager = await getSourceManager(ctx.pandoraSession);
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
			const sourceManager = await getSourceManager(ctx.pandoraSession);
			return sourceManager.getPlaylistTracks(
				input.source,
				input.playlistId,
			);
		}),

	createRadio: publicProcedure
		.input(
			z.object({
				seedTrackId: z.string(),
				name: z.string(),
				artworkUrl: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const db = await getDb();
			const radioUrl = generateRadioUrl(input.seedTrackId);
			const id = `radio-${input.seedTrackId}`;

			await db
				.insert(schema.playlists)
				.values({
					id,
					name: input.name,
					source: "ytmusic",
					url: radioUrl,
					isRadio: true,
					seedTrackId: input.seedTrackId,
					...(input.artworkUrl != null
						? { artworkUrl: input.artworkUrl }
						: {}),
				})
				.onConflictDoNothing();

			// Invalidate cached source managers so they pick up new playlist
			invalidateManagers();

			return { id, url: radioUrl };
		}),
});
