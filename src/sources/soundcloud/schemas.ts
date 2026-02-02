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

// Track schema with media transcoding info for stream URL resolution
export const TrackSchema = z.object({
	id: z.number(),
	title: z.string().nullable().optional(),
	permalink: z.string().optional(),
	permalink_url: z.string().optional(),
	artwork_url: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	duration: z.number().nullable().optional(), // milliseconds
	full_duration: z.number().nullable().optional(),
	genre: z.string().nullable().optional(),
	playback_count: z.number().nullable().optional(),
	likes_count: z.number().nullable().optional(),
	comment_count: z.number().nullable().optional(),
	reposts_count: z.number().nullable().optional(),
	created_at: z.string().optional(),
	user: UserSchema.optional(),
	streamable: z.boolean().optional(),
	downloadable: z.boolean().optional(),
	media: z
		.object({
			transcodings: z
				.array(
					z.object({
						url: z.string(),
						preset: z.string().optional(),
						format: z
							.object({
								protocol: z.string().optional(),
								mime_type: z.string().optional(),
							})
							.optional(),
						quality: z.string().optional(),
					}),
				)
				.optional(),
		})
		.optional(),
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
	tracks: z.array(TrackSchema).optional(),
});

// Track search result
export const TrackSearchResultSchema = z.object({
	collection: z.array(TrackSchema),
	total_results: z.number().optional(),
	next_href: z.string().nullable().optional(),
});

export const PlaylistSearchResultSchema = z.object({
	collection: z.array(PlaylistSchema),
	total_results: z.number().optional(),
	next_href: z.string().nullable().optional(),
});

// Type exports (derived from schemas)
export type User = z.infer<typeof UserSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type TrackSearchResult = z.infer<typeof TrackSearchResultSchema>;
export type PlaylistSearchResult = z.infer<typeof PlaylistSearchResultSchema>;
