/**
 * @module deezer/schemas
 * Zod schemas for Deezer API response validation.
 * Based on public api.deezer.com endpoints.
 * @see https://developers.deezer.com/api
 */

import { z } from "zod";

/**
 * Schema for minimal artist information in search results.
 * Contains basic artist metadata and image URLs.
 */
export const ArtistMinimalSchema = z.object({
	/** Unique Deezer artist ID */
	id: z.number(),
	/** Artist display name */
	name: z.string(),
	/** URL to the artist page on Deezer */
	link: z.string().optional(),
	/** Default artist picture URL */
	picture: z.string().optional(),
	/** Small artist picture (56x56) */
	picture_small: z.string().optional(),
	/** Medium artist picture (250x250) */
	picture_medium: z.string().optional(),
	/** Large artist picture (500x500) */
	picture_big: z.string().optional(),
	/** Extra large artist picture (1000x1000) */
	picture_xl: z.string().optional(),
	/** URL to the artist's tracklist API endpoint */
	tracklist: z.string().optional(),
	/** Resource type identifier */
	type: z.literal("artist").optional(),
});

/**
 * Schema for minimal album information.
 * Contains basic album metadata and cover art URLs.
 */
export const AlbumMinimalSchema = z.object({
	/** Unique Deezer album ID */
	id: z.number(),
	/** Album title */
	title: z.string(),
	/** Default album cover URL */
	cover: z.string().optional(),
	/** Small album cover (56x56) */
	cover_small: z.string().optional(),
	/** Medium album cover (250x250) */
	cover_medium: z.string().optional(),
	/** Large album cover (500x500) */
	cover_big: z.string().optional(),
	/** Extra large album cover (1000x1000) */
	cover_xl: z.string().optional(),
	/** MD5 hash for image generation */
	md5_image: z.string().optional(),
	/** URL to the album's tracklist API endpoint */
	tracklist: z.string().optional(),
	/** Resource type identifier */
	type: z.literal("album").optional(),
});

/**
 * Schema for genre information.
 * Contains genre name and associated picture.
 */
export const GenreSchema = z.object({
	/** Unique Deezer genre ID */
	id: z.number(),
	/** Genre display name */
	name: z.string(),
	/** URL to genre picture */
	picture: z.string().optional(),
	/** Resource type identifier */
	type: z.literal("genre").optional(),
});

/**
 * Schema for album search result items.
 * Extends minimal album info with additional metadata.
 */
export const AlbumSearchItemSchema = AlbumMinimalSchema.extend({
	/** Primary genre ID for the album */
	genre_id: z.number().optional(),
	/** Number of tracks in the album */
	nb_tracks: z.number().optional(),
	/** Album type (album, single, ep, compilation) */
	record_type: z.string().optional(),
	/** Whether the album contains explicit lyrics */
	explicit_lyrics: z.boolean().optional(),
	/** Primary artist information */
	artist: ArtistMinimalSchema.optional(),
});

/**
 * Schema for the album search API response.
 * Contains paginated search results.
 */
export const AlbumSearchResultSchema = z.object({
	/** Array of matching albums */
	data: z.array(AlbumSearchItemSchema),
	/** Total number of matching results */
	total: z.number().optional(),
	/** URL to fetch the next page of results */
	next: z.string().optional(),
});

/**
 * Schema for Deezer API error responses.
 * Used to detect and handle API errors in JSON responses.
 */
export const ErrorResponseSchema = z.object({
	error: z.object({
		/** Error type identifier */
		type: z.string(),
		/** Human-readable error message */
		message: z.string(),
		/** Numeric error code */
		code: z.number(),
	}),
});

/**
 * Minimal artist information.
 * Derived from ArtistMinimalSchema.
 */
export type ArtistMinimal = z.infer<typeof ArtistMinimalSchema>;

/**
 * Minimal album information.
 * Derived from AlbumMinimalSchema.
 */
export type AlbumMinimal = z.infer<typeof AlbumMinimalSchema>;

/**
 * Album search result item with full metadata.
 * Derived from AlbumSearchItemSchema.
 */
export type AlbumSearchItem = z.infer<typeof AlbumSearchItemSchema>;

/**
 * Genre information.
 * Derived from GenreSchema.
 */
export type Genre = z.infer<typeof GenreSchema>;

/**
 * Album search API response.
 * Derived from AlbumSearchResultSchema.
 */
export type AlbumSearchResult = z.infer<typeof AlbumSearchResultSchema>;

/**
 * Deezer API error response.
 * Derived from ErrorResponseSchema.
 */
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
