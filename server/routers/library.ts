/**
 * @module server/routers/library
 * User library management router for albums, tracks, placements, and bookmarks.
 */

import { z } from "zod";
import { Effect } from "effect";
import { router, pandoraProtectedProcedure, publicProcedure } from "../trpc.js";
import { trackCapabilities, parseId } from "../lib/ids.js";
import type { SourceType } from "../../src/sources/types.js";
import { getDb } from "../../src/db/index.js";
import { ensureSourceManager } from "../services/sourceManager.js";
import * as Pandora from "../../src/sources/pandora/client.js";
import {
	getLibraryAlbum,
	listLibraryAlbums,
	resolveAlbumStatesForSourceIds,
	saveAlbumToLibrary,
	setAlbumPlacement,
} from "../services/libraryAlbums.js";
import { ALL_ALBUM_PLACEMENTS } from "../services/libraryPlacement.js";

const AlbumPlacementSchema = z.enum(ALL_ALBUM_PLACEMENTS);

/**
 * Library router providing local album management and Pandora bookmark operations.
 */
export const libraryRouter = router({
	albums: publicProcedure
		.input(
			z
				.object({
					placements: z.array(AlbumPlacementSchema).optional(),
					includeArchive: z.boolean().optional(),
					includeDismissed: z.boolean().optional(),
					hotOnly: z.boolean().optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const db = await getDb();
			return listLibraryAlbums(db, input);
		}),

	album: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const db = await getDb();
			return getLibraryAlbum(db, input.id);
		}),

	hotAlbums: publicProcedure
		.input(
			z
				.object({
					includeDismissed: z.boolean().optional(),
					limit: z.number().int().min(1).max(100).optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const db = await getDb();
			const albums = await listLibraryAlbums(db, {
				hotOnly: true,
				includeArchive: true,
				includeDismissed: input?.includeDismissed ?? true,
			});
			return albums.slice(0, input?.limit ?? 20);
		}),

	resolveAlbumStates: publicProcedure
		.input(
			z.object({
				sourceIds: z.array(z.string()),
			}),
		)
		.query(async ({ input }) => {
			const db = await getDb();
			return resolveAlbumStatesForSourceIds(db, input.sourceIds);
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
				throw new Error(
					`Cannot save album: ID must be a source-prefixed ID (e.g. ytmusic:abc), got: ${input.id}`,
				);
			}

			const db = await getDb();
			const sourceManager = await ensureSourceManager();
			const result = await saveAlbumToLibrary(db, sourceManager, input.id);
			await db.flush();
			return result;
		}),

	setPlacement: publicProcedure
		.input(
			z.object({
				albumId: z.string(),
				placement: AlbumPlacementSchema,
			}),
		)
		.mutation(async ({ input }) => {
			const db = await getDb();
			const album = await setAlbumPlacement(db, input.albumId, input.placement);
			await db.flush();
			return album;
		}),

	removeAlbum: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const db = await getDb();
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
		return Effect.runPromise(Pandora.getBookmarks(ctx.pandoraSession));
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
