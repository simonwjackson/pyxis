import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq } from "drizzle-orm";

const albumInput = z.object({
	id: z.string(),
	title: z.string(),
	artist: z.string(),
	year: z.number().optional(),
	artworkUrl: z.string().optional(),
	sourceRefs: z.array(
		z.object({
			source: z.string(),
			sourceId: z.string(),
		}),
	),
});

export const collectionRouter = router({
	listAlbums: publicProcedure.query(async () => {
		const db = await getDb();
		const allAlbums = await db.select().from(schema.albums);
		const allRefs = await db.select().from(schema.albumSourceRefs);

		return allAlbums.map((album) => ({
			...album,
			sourceRefs: allRefs
				.filter((ref) => ref.albumId === album.id)
				.map((ref) => ({ source: ref.source, sourceId: ref.sourceId })),
		}));
	}),

	addAlbum: publicProcedure.input(albumInput).mutation(async ({ input }) => {
		const db = await getDb();
		await db.insert(schema.albums).values({
			id: input.id,
			title: input.title,
			artist: input.artist,
			...(input.year != null ? { year: input.year } : {}),
			...(input.artworkUrl != null ? { artworkUrl: input.artworkUrl } : {}),
		});

		for (const ref of input.sourceRefs) {
			await db.insert(schema.albumSourceRefs).values({
				id: `${input.id}-${ref.source}-${ref.sourceId}`,
				albumId: input.id,
				source: ref.source,
				sourceId: ref.sourceId,
			});
		}

		return { id: input.id };
	}),

	removeAlbum: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const db = await getDb();
			await db.delete(schema.albums).where(eq(schema.albums.id, input.id));
			return { success: true };
		}),
});
