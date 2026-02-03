import { z } from "zod";
import { Effect } from "effect";
import { router, pandoraProtectedProcedure, publicProcedure } from "../trpc.js";
import { formatSourceId, generateId, parseId, trackCapabilities } from "../lib/ids.js";
import type { SourceType } from "../../src/sources/types.js";
import { getDb, schema } from "../../src/db/index.js";
import { eq, and } from "drizzle-orm";
import { ensureSourceManager } from "../services/sourceManager.js";
import * as Pandora from "../../src/sources/pandora/client.js";

export const libraryRouter = router({
	albums: publicProcedure.query(async () => {
		const db = await getDb();
		const allAlbums = await db.select().from(schema.albums);
		const allRefs = await db.select().from(schema.albumSourceRefs);

		return allAlbums.map((album) => {
			const refs = allRefs.filter((ref) => ref.albumId === album.id);
			return {
				id: album.id,
				title: album.title,
				artist: album.artist,
				year: album.year,
				artworkUrl: album.artworkUrl,
				sourceIds: refs.map((ref) => formatSourceId(ref.source as SourceType, ref.sourceId)),
			};
		});
	}),

	albumTracks: publicProcedure
		.input(z.object({ albumId: z.string() }))
		.query(async ({ input }) => {
			const db = await getDb();
			const tracks = await db
				.select()
				.from(schema.albumTracks)
				.where(eq(schema.albumTracks.albumId, input.albumId));
			return tracks
				.sort((a, b) => a.trackIndex - b.trackIndex)
				.map((t) => ({
					id: t.id,
					trackIndex: t.trackIndex,
					title: t.title,
					artist: t.artist,
					duration: t.duration,
					artworkUrl: t.artworkUrl,
					capabilities: trackCapabilities(t.source as SourceType),
				}));
		}),

	saveAlbum: publicProcedure
		.input(
			z.object({
				id: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const parsed = parseId(input.id);
			if (!parsed.source) {
				throw new Error(`Cannot save album: ID must be a source-prefixed ID (e.g. ytmusic:abc), got: ${input.id}`);
			}
			const source = parsed.source;
			const albumId = parsed.id;
			const sourceManager = await ensureSourceManager();

			const db = await getDb();
			const existing = await db
				.select()
				.from(schema.albumSourceRefs)
				.where(
					and(
						eq(schema.albumSourceRefs.source, source),
						eq(schema.albumSourceRefs.sourceId, albumId),
					),
				);
			const first = existing[0];
			if (first) {
				return { id: first.albumId, alreadyExists: true };
			}

			const { album, tracks } = await sourceManager.getAlbumTracks(
				source,
				albumId,
			);

			const newAlbumId = generateId();

			await db.insert(schema.albums).values({
				id: newAlbumId,
				title: album.title,
				artist: album.artist,
				...(album.year != null ? { year: album.year } : {}),
				...(album.artworkUrl != null
					? { artworkUrl: album.artworkUrl }
					: {}),
			});

			for (const sid of album.sourceIds) {
				await db.insert(schema.albumSourceRefs).values({
					id: `${newAlbumId}-${sid.source}-${sid.id}`,
					albumId: newAlbumId,
					source: sid.source,
					sourceId: sid.id,
				});
			}

			for (const [index, track] of tracks.entries()) {
				await db.insert(schema.albumTracks).values({
					id: generateId(),
					albumId: newAlbumId,
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

			return { id: newAlbumId, alreadyExists: false };
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

	bookmarks: pandoraProtectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getBookmarks(ctx.pandoraSession),
		);
	}),

	addBookmark: pandoraProtectedProcedure
		.input(
			z.object({
				id: z.string(),
				type: z.enum(["artist", "song"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const parsed = parseId(input.id);
			const trackToken = parsed.id;
			if (input.type === "artist") {
				return Effect.runPromise(
					Pandora.addArtistBookmark(ctx.pandoraSession, {
						trackToken,
					}),
				);
			}
			return Effect.runPromise(
				Pandora.addSongBookmark(ctx.pandoraSession, {
					trackToken,
				}),
			);
		}),

	removeBookmark: pandoraProtectedProcedure
		.input(
			z.object({
				bookmarkToken: z.string(),
				type: z.enum(["artist", "song"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// bookmarkToken is a raw Pandora bookmark token (from getBookmarks response)
			if (input.type === "artist") {
				await Effect.runPromise(
					Pandora.deleteArtistBookmark(ctx.pandoraSession, {
						bookmarkToken: input.bookmarkToken,
					}),
				);
			} else {
				await Effect.runPromise(
					Pandora.deleteSongBookmark(ctx.pandoraSession, {
						bookmarkToken: input.bookmarkToken,
					}),
				);
			}
			return { success: true };
		}),
});
