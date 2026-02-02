import { z } from "zod";

/**
 * SoundCloud V2 API Schemas
 * Based on unofficial api-v2.soundcloud.com endpoints
 */

export const UserSchema = z.object({
	id: z.number(),
	username: z.string(),
	permalink: z.string().optional(),
	permalink_url: z.string().optional(),
	avatar_url: z.string().nullable().optional(),
	city: z.string().nullable().optional(),
	country_code: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	followers_count: z.number().optional(),
	followings_count: z.number().optional(),
	track_count: z.number().optional(),
	playlist_count: z.number().optional(),
	likes_count: z.number().optional(),
	verified: z.boolean().optional(),
	first_name: z.string().nullable().optional(),
	last_name: z.string().nullable().optional(),
	full_name: z.string().nullable().optional(),
});

export const PlaylistSchema = z.object({
	id: z.number(),
	title: z.string(),
	permalink: z.string().optional(),
	permalink_url: z.string().optional(),
	artwork_url: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	duration: z.number().nullable().optional(),
	track_count: z.number().optional(),
	likes_count: z.number().nullable().optional(),
	reposts_count: z.number().nullable().optional(),
	created_at: z.string().optional(),
	genre: z.string().nullable().optional(),
	is_album: z.boolean().optional(),
	set_type: z.string().nullable().optional(),
	user: UserSchema.optional(),
});

export const PlaylistSearchResultSchema = z.object({
	collection: z.array(PlaylistSchema),
	total_results: z.number().optional(),
	next_href: z.string().nullable().optional(),
});

// Type exports (derived from schemas)
export type User = z.infer<typeof UserSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type PlaylistSearchResult = z.infer<typeof PlaylistSearchResultSchema>;
