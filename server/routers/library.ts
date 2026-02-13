/**
 * @module server/routers/library
 * User library management router for albums, tracks, and bookmarks.
 * Provides CRUD operations for the local album library stored via ProseQL,
 * and Pandora bookmark management for authenticated users.
 */

import { z } from "zod";
import { Effect } from "effect";
import { router, pandoraProtectedProcedure, publicProcedure } from "../trpc.js";
import { formatSourceId, generateId, parseId, trackCapabilities } from "../lib/ids.js";
import type { SourceType } from "../../src/sources/types.js";
import { getDb } from "../../src/db/index.js";
import { ensureSourceManager } from "../services/sourceManager.js";
import * as Pandora from "../../src/sources/pandora/client.js";

/**
 * Library router providing local album management and Pandora bookmark operations.
 *
 * Endpoints:
 * - `albums` - List all saved albums in the library
 * - `albumTracks` - Get tracks for a library album
 * - `saveAlbum` - Save an album from any source to the library
 * - `removeAlbum` - Delete an album from the library
 * - `bookmarks` - Get Pandora bookmarks (requires auth)
 * - `addBookmark` - Bookmark an artist or song (requires auth)
 * - `removeBookmark` - Remove a bookmark (requires auth)
 */
export const libraryRouter = router({
	albums: publicProcedure.query(async () => {
		const db = await getDb();
		const allAlbums = await db.albums.query({}).runPromise;
		const allRefs = await db.albumSourceRefs.query({}).runPromise;

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
			const tracks = await db.albumTracks.query({
				where: { albumId: input.albumId },
				sort: { trackIndex: "asc" },
			}).runPromise;
			return tracks.map((t) => ({
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
			// Check if already exists using indexed [source, sourceId] query
			const existing = await db.albumSourceRefs.query({
				where: { source, sourceId: albumId },
			}).runPromise;
			const first = existing[0];
			if (first) {
				return { id: first.albumId, alreadyExists: true };
			}

			const { album, tracks } = await sourceManager.getAlbumTracks(
				source,
				albumId,
			);

			const newAlbumId = generateId();

			// Use Effect.gen for the transaction
			await Effect.runPromise(
				db.$transaction((tx) =>
					Effect.gen(function* () {
						yield* tx.albums.create({
							id: newAlbumId,
							title: album.title,
							artist: album.artist,
							...(album.year != null ? { year: album.year } : {}),
							...(album.artworkUrl != null
								? { artworkUrl: album.artworkUrl }
								: {}),
						});

						for (const sid of album.sourceIds) {
							yield* tx.albumSourceRefs.create({
								id: `${newAlbumId}-${sid.source}-${sid.id}`,
								albumId: newAlbumId,
								source: sid.source,
								sourceId: sid.id,
							});
						}

						for (const [index, track] of tracks.entries()) {
							yield* tx.albumTracks.create({
								id: generateId(),
								albumId: newAlbumId,
								trackIndex: index,
								title: track.title,
								artist: track.artist,
								source: track.sourceId.source,
								sourceTrackId: track.sourceId.id,
								...(track.duration != null
									? { duration: Math.round(track.duration) }
									: {}),
								...(track.artworkUrl != null
									? { artworkUrl: track.artworkUrl }
									: {}),
							});
						}
					})
				)
			);

			// Flush to disk for immediate persistence
			await db.flush();

			return { id: newAlbumId, alreadyExists: false };
		}),

	removeAlbum: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const db = await getDb();
			// Manual cascade: delete tracks, then refs, then album
			const tracks = await db.albumTracks.query({ where: { albumId: input.id } }).runPromise;
			for (const track of tracks) {
				await db.albumTracks.delete(track.id).runPromise;
			}
			const refs = await db.albumSourceRefs.query({ where: { albumId: input.id } }).runPromise;
			for (const ref of refs) {
				await db.albumSourceRefs.delete(ref.id).runPromise;
			}
			await db.albums.delete(input.id).runPromise;
			return { success: true };
		}),

	updateAlbum: publicProcedure
		.input(
			z
				.object({
					id: z.string(),
					title: z.string().trim().min(1).optional(),
					artist: z.string().trim().min(1).optional(),
				})
				.refine((d) => d.title !== undefined || d.artist !== undefined),
		)
		.mutation(async ({ input }) => {
			const db = await getDb();
			const fields: { title?: string; artist?: string } = {};
			if (input.title !== undefined) fields.title = input.title;
			if (input.artist !== undefined) fields.artist = input.artist;
			await db.albums.update(input.id, fields).runPromise;
			return { success: true };
		}),

	updateTrack: publicProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().trim().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const db = await getDb();
			await db.albumTracks.update(input.id, { title: input.title }).runPromise;
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
