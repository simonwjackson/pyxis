import { z } from "zod";

/**
 * Discogs API Schemas
 * Based on https://www.discogs.com/developers
 */

// Artist schema
export const DiscogsArtistSchema = z.object({
	id: z.number(),
	name: z.string(),
	resource_url: z.string(),
});

// Search result schema
export const DiscogsSearchResultSchema = z.object({
	id: z.number(),
	type: z.enum(["master", "release", "artist", "label"]),
	title: z.string(),
	thumb: z.string().optional(),
	cover_image: z.string().optional(),
	resource_url: z.string(),
	uri: z.string(),
	country: z.string().optional(),
	year: z.string().optional(),
	format: z.array(z.string()).optional(),
	label: z.array(z.string()).optional(),
	genre: z.array(z.string()).optional(),
	style: z.array(z.string()).optional(),
	master_id: z.number().optional(),
	master_url: z.string().optional(),
});

// Pagination schema
export const DiscogsPaginationSchema = z.object({
	page: z.number(),
	pages: z.number(),
	per_page: z.number(),
	items: z.number(),
});

// Search response schema
export const DiscogsSearchResponseSchema = z.object({
	pagination: DiscogsPaginationSchema,
	results: z.array(DiscogsSearchResultSchema),
});

// Tracklist item schema
export const DiscogsTracklistItemSchema = z.object({
	position: z.string(),
	title: z.string(),
	duration: z.string().optional(),
});

// Master release schema
export const DiscogsMasterSchema = z.object({
	id: z.number(),
	title: z.string(),
	year: z.number().optional(),
	artists: z.array(DiscogsArtistSchema),
	genres: z.array(z.string()),
	styles: z.array(z.string()).optional(),
	tracklist: z.array(DiscogsTracklistItemSchema),
	main_release: z.number(),
	most_recent_release: z.number().optional(),
	num_for_sale: z.number().optional(),
	lowest_price: z.number().nullable().optional(),
	resource_url: z.string(),
	uri: z.string(),
});

// Rate limit info schema
export const DiscogsRateLimitSchema = z.object({
	limit: z.number(),
	used: z.number(),
	remaining: z.number(),
});

// Type exports (derived from schemas)
export type DiscogsArtist = z.infer<typeof DiscogsArtistSchema>;
export type DiscogsSearchResult = z.infer<typeof DiscogsSearchResultSchema>;
export type DiscogsPagination = z.infer<typeof DiscogsPaginationSchema>;
export type DiscogsSearchResponse = z.infer<typeof DiscogsSearchResponseSchema>;
export type DiscogsTracklistItem = z.infer<typeof DiscogsTracklistItemSchema>;
export type DiscogsMaster = z.infer<typeof DiscogsMasterSchema>;
export type DiscogsRateLimit = z.infer<typeof DiscogsRateLimitSchema>;
