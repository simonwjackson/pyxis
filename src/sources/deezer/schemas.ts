import { z } from "zod";

/**
 * Deezer API Schemas
 * Based on public api.deezer.com endpoints
 * https://developers.deezer.com/api
 */

export const ArtistMinimalSchema = z.object({
	id: z.number(),
	name: z.string(),
	link: z.string().optional(),
	picture: z.string().optional(),
	picture_small: z.string().optional(),
	picture_medium: z.string().optional(),
	picture_big: z.string().optional(),
	picture_xl: z.string().optional(),
	tracklist: z.string().optional(),
	type: z.literal("artist").optional(),
});

export const AlbumMinimalSchema = z.object({
	id: z.number(),
	title: z.string(),
	cover: z.string().optional(),
	cover_small: z.string().optional(),
	cover_medium: z.string().optional(),
	cover_big: z.string().optional(),
	cover_xl: z.string().optional(),
	md5_image: z.string().optional(),
	tracklist: z.string().optional(),
	type: z.literal("album").optional(),
});

export const GenreSchema = z.object({
	id: z.number(),
	name: z.string(),
	picture: z.string().optional(),
	type: z.literal("genre").optional(),
});

export const AlbumSearchItemSchema = AlbumMinimalSchema.extend({
	genre_id: z.number().optional(),
	nb_tracks: z.number().optional(),
	record_type: z.string().optional(),
	explicit_lyrics: z.boolean().optional(),
	artist: ArtistMinimalSchema.optional(),
});

export const AlbumSearchResultSchema = z.object({
	data: z.array(AlbumSearchItemSchema),
	total: z.number().optional(),
	next: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
	error: z.object({
		type: z.string(),
		message: z.string(),
		code: z.number(),
	}),
});

// Type exports (derived from schemas)
export type ArtistMinimal = z.infer<typeof ArtistMinimalSchema>;
export type AlbumMinimal = z.infer<typeof AlbumMinimalSchema>;
export type AlbumSearchItem = z.infer<typeof AlbumSearchItemSchema>;
export type Genre = z.infer<typeof GenreSchema>;
export type AlbumSearchResult = z.infer<typeof AlbumSearchResultSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
