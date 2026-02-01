import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq, and } from "drizzle-orm";
import { getGlobalSourceManager } from "../services/sourceManager.js";

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

const albumWithTracksInput = z.object({
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
	tracks: z.array(
		z.object({
			trackIndex: z.number(),
			title: z.string(),
			artist: z.string(),
			duration: z.number().optional(),
			source: z.string(),
			sourceTrackId: z.string(),
			artworkUrl: z.string().optional(),
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

	getAlbumTracks: publicProcedure
		.input(z.object({ albumId: z.string() }))
		.query(async ({ input }) => {
			const db = await getDb();
			const tracks = await db
				.select()
				.from(schema.albumTracks)
				.where(eq(schema.albumTracks.albumId, input.albumId));
			return tracks.sort((a, b) => a.trackIndex - b.trackIndex);
		}),

	addAlbum: publicProcedure.input(albumInput).mutation(async ({ input }) => {
		const db = await getDb();
		await db.insert(schema.albums).values({
			id: input.id,
			title: input.title,
			artist: input.artist,
			...(input.year != null ? { year: input.year } : {}),
			...(input.artworkUrl != null
				? { artworkUrl: input.artworkUrl }
				: {}),
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

	addAlbumWithTracks: publicProcedure
		.input(albumWithTracksInput)
		.mutation(async ({ input }) => {
			const db = await getDb();

			// Duplicate detection: check if album already exists by source ref
			for (const ref of input.sourceRefs) {
				const existing = await db
					.select()
					.from(schema.albumSourceRefs)
					.where(
						and(
							eq(schema.albumSourceRefs.source, ref.source),
							eq(schema.albumSourceRefs.sourceId, ref.sourceId),
						),
					);
				const first = existing[0];
				if (first) {
					return { id: first.albumId, alreadyExists: true };
				}
			}

			await db.insert(schema.albums).values({
				id: input.id,
				title: input.title,
				artist: input.artist,
				...(input.year != null ? { year: input.year } : {}),
				...(input.artworkUrl != null
					? { artworkUrl: input.artworkUrl }
					: {}),
			});

			for (const ref of input.sourceRefs) {
				await db.insert(schema.albumSourceRefs).values({
					id: `${input.id}-${ref.source}-${ref.sourceId}`,
					albumId: input.id,
					source: ref.source,
					sourceId: ref.sourceId,
				});
			}

			for (const track of input.tracks) {
				await db.insert(schema.albumTracks).values({
					id: `${input.id}-track-${String(track.trackIndex)}`,
					albumId: input.id,
					trackIndex: track.trackIndex,
					title: track.title,
					artist: track.artist,
					...(track.duration != null
						? { duration: track.duration }
						: {}),
					source: track.source,
					sourceTrackId: track.sourceTrackId,
					...(track.artworkUrl != null
						? { artworkUrl: track.artworkUrl }
						: {}),
				});
			}

			return { id: input.id, alreadyExists: false };
		}),

	saveAlbum: publicProcedure
		.input(
			z.object({
				source: z.enum(["pandora", "ytmusic", "local"]),
				albumId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const sourceManager = getGlobalSourceManager();
			if (!sourceManager) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "No active session — cannot fetch album tracks",
				});
			}

			// Duplicate detection: check if album already exists by source ref
			const db = await getDb();
			const existing = await db
				.select()
				.from(schema.albumSourceRefs)
				.where(
					and(
						eq(schema.albumSourceRefs.source, input.source),
						eq(schema.albumSourceRefs.sourceId, input.albumId),
					),
				);
			const first = existing[0];
			if (first) {
				return { id: first.albumId, alreadyExists: true };
			}

			// Fetch full album details + tracks from the source
			const { album, tracks } = await sourceManager.getAlbumTracks(
				input.source,
				input.albumId,
			);

			await db.insert(schema.albums).values({
				id: album.id,
				title: album.title,
				artist: album.artist,
				...(album.year != null ? { year: album.year } : {}),
				...(album.artworkUrl != null
					? { artworkUrl: album.artworkUrl }
					: {}),
			});

			for (const sid of album.sourceIds) {
				await db.insert(schema.albumSourceRefs).values({
					id: `${album.id}-${sid.source}-${sid.id}`,
					albumId: album.id,
					source: sid.source,
					sourceId: sid.id,
				});
			}

			for (const [index, track] of tracks.entries()) {
				await db.insert(schema.albumTracks).values({
					id: `${album.id}-track-${String(index)}`,
					albumId: album.id,
					trackIndex: index,
					title: track.title,
					artist: track.artist,
					...(track.duration != null
						? { duration: Math.round(track.duration) }
						: {}),
					source: track.sourceId.source,
					sourceTrackId: track.sourceId.id,
					...(track.artworkUrl != null
						? { artworkUrl: track.artworkUrl }
						: {}),
				});
			}

			return { id: album.id, alreadyExists: false };
		}),

	removeAlbum: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const db = await getDb();
			await db
				.delete(schema.albums)
				.where(eq(schema.albums.id, input.id));
			return { success: true };
		}),
});
