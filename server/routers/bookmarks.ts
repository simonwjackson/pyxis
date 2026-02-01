import { z } from "zod";
import { Effect } from "effect";
import { router, protectedProcedure } from "../trpc.js";
import * as Pandora from "../../src/sources/pandora/client.js";

export const bookmarksRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return Effect.runPromise(
			Pandora.getBookmarks(ctx.pandoraSession),
		);
	}),

	addArtist: protectedProcedure
		.input(z.object({ trackToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.addArtistBookmark(ctx.pandoraSession, input),
			);
		}),

	addSong: protectedProcedure
		.input(z.object({ trackToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return Effect.runPromise(
				Pandora.addSongBookmark(ctx.pandoraSession, input),
			);
		}),

	deleteArtist: protectedProcedure
		.input(z.object({ bookmarkToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.deleteArtistBookmark(ctx.pandoraSession, input),
			);
			return { success: true };
		}),

	deleteSong: protectedProcedure
		.input(z.object({ bookmarkToken: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await Effect.runPromise(
				Pandora.deleteSongBookmark(ctx.pandoraSession, input),
			);
			return { success: true };
		}),
});
