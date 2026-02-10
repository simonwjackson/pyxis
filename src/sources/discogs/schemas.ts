/**
 * @module discogs/schemas
 * Zod schemas for Discogs API response validation.
 * Based on the official Discogs API documentation.
 * @see https://www.discogs.com/developers
 */

import { z } from "zod";

/**
 * Schema for artist information in releases and tracklists.
 * Contains basic artist metadata and API resource URL.
 */
export const DiscogsArtistSchema = z.object({
	/** Unique Discogs artist ID */
	id: z.number(),
	/** Artist display name (may include disambiguation number like "Artist (2)") */
	name: z.string(),
	/** API URL for this artist resource */
	resource_url: z.string(),
});

/**
 * Schema for search result items.
 * Generic search result that can be master, release, artist, or label.
 */
export const DiscogsSearchResultSchema = z.object({
	/** Unique ID for this result */
	id: z.number(),
	/** Result type: master, release, artist, or label */
	type: z.enum(["master", "release", "artist", "label"]),
	/** Display title (format varies by type) */
	title: z.string(),
	/** Small thumbnail image URL */
	thumb: z.string().optional(),
	/** Full-size cover image URL */
	cover_image: z.string().optional(),
	/** API URL for this resource */
	resource_url: z.string(),
	/** Discogs website URI path */
	uri: z.string(),
	/** Country of release */
	country: z.string().optional(),
	/** Release year as string */
	year: z.string().optional(),
	/** Physical formats (CD, Vinyl, etc.) */
	format: z.array(z.string()).optional(),
	/** Record label names */
	label: z.array(z.string()).optional(),
	/** Genre classifications */
	genre: z.array(z.string()).optional(),
	/** Style/subgenre classifications */
	style: z.array(z.string()).optional(),
	/** Associated master release ID */
	master_id: z.number().optional(),
	/** API URL for associated master release */
	master_url: z.string().optional(),
});

/**
 * Schema for pagination metadata in search responses.
 * Contains page info and total counts.
 */
export const DiscogsPaginationSchema = z.object({
	/** Current page number (1-indexed) */
	page: z.number(),
	/** Total number of pages */
	pages: z.number(),
	/** Results per page */
	per_page: z.number(),
	/** Total number of matching items */
	items: z.number(),
});

/**
 * Schema for the search API response.
 * Contains paginated search results.
 */
export const DiscogsSearchResponseSchema = z.object({
	/** Pagination metadata */
	pagination: DiscogsPaginationSchema,
	/** Array of search results */
	results: z.array(DiscogsSearchResultSchema),
});

/**
 * Schema for tracklist items in master releases.
 * Contains track position, title, and optional duration.
 */
export const DiscogsTracklistItemSchema = z.object({
	/** Track position (e.g., "A1", "B2", "1", "2") */
	position: z.string(),
	/** Track title */
	title: z.string(),
	/** Track duration in "mm:ss" format */
	duration: z.string().optional(),
});

/**
 * Schema for master release details.
 * Contains full album/release information including tracklist.
 */
export const DiscogsMasterSchema = z.object({
	/** Unique master release ID */
	id: z.number(),
	/** Album/release title */
	title: z.string(),
	/** Release year */
	year: z.number().optional(),
	/** Artists credited on this release */
	artists: z.array(DiscogsArtistSchema),
	/** Genre classifications */
	genres: z.array(z.string()),
	/** Style/subgenre classifications */
	styles: z.array(z.string()).optional(),
	/** Complete tracklist */
	tracklist: z.array(DiscogsTracklistItemSchema),
	/** ID of the main/primary release version */
	main_release: z.number(),
	/** ID of the most recently added release version */
	most_recent_release: z.number().optional(),
	/** Number of copies currently for sale in marketplace */
	num_for_sale: z.number().optional(),
	/** Lowest price in marketplace (null if none for sale) */
	lowest_price: z.number().nullable().optional(),
	/** API URL for this master release */
	resource_url: z.string(),
	/** Discogs website URI path */
	uri: z.string(),
});

/**
 * Schema for rate limit information from response headers.
 * Used to track API usage and remaining quota.
 */
export const DiscogsRateLimitSchema = z.object({
	/** Maximum requests allowed per minute */
	limit: z.number(),
	/** Number of requests used in current window */
	used: z.number(),
	/** Remaining requests in current window */
	remaining: z.number(),
});

/**
 * Artist information.
 * Derived from DiscogsArtistSchema.
 */
export type DiscogsArtist = z.infer<typeof DiscogsArtistSchema>;

/**
 * Search result item.
 * Derived from DiscogsSearchResultSchema.
 */
export type DiscogsSearchResult = z.infer<typeof DiscogsSearchResultSchema>;

/**
 * Pagination metadata.
 * Derived from DiscogsPaginationSchema.
 */
export type DiscogsPagination = z.infer<typeof DiscogsPaginationSchema>;

/**
 * Search API response.
 * Derived from DiscogsSearchResponseSchema.
 */
export type DiscogsSearchResponse = z.infer<typeof DiscogsSearchResponseSchema>;

/**
 * Tracklist item.
 * Derived from DiscogsTracklistItemSchema.
 */
export type DiscogsTracklistItem = z.infer<typeof DiscogsTracklistItemSchema>;

/**
 * Master release details.
 * Derived from DiscogsMasterSchema.
 */
export type DiscogsMaster = z.infer<typeof DiscogsMasterSchema>;

/**
 * Rate limit information.
 * Derived from DiscogsRateLimitSchema.
 */
export type DiscogsRateLimit = z.infer<typeof DiscogsRateLimitSchema>;
