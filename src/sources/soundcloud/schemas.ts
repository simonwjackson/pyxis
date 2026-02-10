/**
 * @module soundcloud/schemas
 * Zod schemas for SoundCloud V2 API response validation.
 * Based on unofficial api-v2.soundcloud.com endpoints.
 */

import { z } from "zod";

/**
 * Schema for SoundCloud user information.
 * Contains basic user profile metadata.
 */
export const UserSchema = z.object({
	/** Unique SoundCloud user ID */
	id: z.number(),
	/** Username (display name) */
	username: z.string(),
	/** URL-safe permalink slug */
	permalink: z.string().optional(),
	/** Full permalink URL */
	permalink_url: z.string().optional(),
	/** Avatar image URL */
	avatar_url: z.string().nullable().optional(),
	/** City name */
	city: z.string().nullable().optional(),
	/** ISO country code */
	country_code: z.string().nullable().optional(),
	/** User bio/description */
	description: z.string().nullable().optional(),
	/** Number of followers */
	followers_count: z.number().optional(),
	/** Number of users being followed */
	followings_count: z.number().optional(),
	/** Number of tracks uploaded */
	track_count: z.number().optional(),
	/** Number of playlists created */
	playlist_count: z.number().optional(),
	/** Number of likes given */
	likes_count: z.number().optional(),
	/** Whether the user is verified */
	verified: z.boolean().optional(),
	/** First name */
	first_name: z.string().nullable().optional(),
	/** Last name */
	last_name: z.string().nullable().optional(),
	/** Combined full name */
	full_name: z.string().nullable().optional(),
});

/**
 * Schema for track information with media transcoding.
 * Contains playback metadata and streaming URL resolution data.
 */
export const TrackSchema = z.object({
	/** Unique SoundCloud track ID */
	id: z.number(),
	/** Track title */
	title: z.string().nullable().optional(),
	/** URL-safe permalink slug */
	permalink: z.string().optional(),
	/** Full permalink URL */
	permalink_url: z.string().optional(),
	/** Artwork image URL */
	artwork_url: z.string().nullable().optional(),
	/** Track description */
	description: z.string().nullable().optional(),
	/** Duration in milliseconds */
	duration: z.number().nullable().optional(),
	/** Full duration including any intro (milliseconds) */
	full_duration: z.number().nullable().optional(),
	/** Genre tag */
	genre: z.string().nullable().optional(),
	/** Number of plays */
	playback_count: z.number().nullable().optional(),
	/** Number of likes */
	likes_count: z.number().nullable().optional(),
	/** Number of comments */
	comment_count: z.number().nullable().optional(),
	/** Number of reposts */
	reposts_count: z.number().nullable().optional(),
	/** ISO timestamp of creation */
	created_at: z.string().optional(),
	/** Uploader information */
	user: UserSchema.optional(),
	/** Whether the track can be streamed */
	streamable: z.boolean().optional(),
	/** Whether the track can be downloaded */
	downloadable: z.boolean().optional(),
	/** Media transcoding information for stream URL resolution */
	media: z
		.object({
			/** Available transcoding formats and their URLs */
			transcodings: z
				.array(
					z.object({
						/** URL to resolve the stream (requires client_id) */
						url: z.string(),
						/** Encoding preset name */
						preset: z.string().optional(),
						/** Format information */
						format: z
							.object({
								/** Protocol: "progressive" for HTTP, "hls" for HLS */
								protocol: z.string().optional(),
								/** MIME type (e.g., "audio/mpeg") */
								mime_type: z.string().optional(),
							})
							.optional(),
						/** Quality level */
						quality: z.string().optional(),
					}),
				)
				.optional(),
		})
		.optional(),
});

/**
 * Schema for playlist/album information.
 * Contains collection metadata and track listing.
 */
export const PlaylistSchema = z.object({
	/** Unique SoundCloud playlist ID */
	id: z.number(),
	/** Playlist title */
	title: z.string(),
	/** URL-safe permalink slug */
	permalink: z.string().optional(),
	/** Full permalink URL */
	permalink_url: z.string().optional(),
	/** Playlist artwork URL */
	artwork_url: z.string().nullable().optional(),
	/** Playlist description */
	description: z.string().nullable().optional(),
	/** Total duration in milliseconds */
	duration: z.number().nullable().optional(),
	/** Number of tracks in the playlist */
	track_count: z.number().optional(),
	/** Number of likes */
	likes_count: z.number().nullable().optional(),
	/** Number of reposts */
	reposts_count: z.number().nullable().optional(),
	/** ISO timestamp of creation */
	created_at: z.string().optional(),
	/** Genre tag */
	genre: z.string().nullable().optional(),
	/** Whether this is marked as an album */
	is_album: z.boolean().optional(),
	/** Set type: "album", "ep", "single", "compilation", or null */
	set_type: z.string().nullable().optional(),
	/** Creator information */
	user: UserSchema.optional(),
	/** Tracks in the playlist (may be stubs requiring full fetch) */
	tracks: z.array(TrackSchema).optional(),
});

/**
 * Schema for track search results.
 * Contains paginated collection of matching tracks.
 */
export const TrackSearchResultSchema = z.object({
	/** Array of matching tracks */
	collection: z.array(TrackSchema),
	/** Total number of results */
	total_results: z.number().optional(),
	/** URL to fetch next page (null if no more results) */
	next_href: z.string().nullable().optional(),
});

/**
 * Schema for playlist/album search results.
 * Contains paginated collection of matching playlists.
 */
export const PlaylistSearchResultSchema = z.object({
	/** Array of matching playlists */
	collection: z.array(PlaylistSchema),
	/** Total number of results */
	total_results: z.number().optional(),
	/** URL to fetch next page (null if no more results) */
	next_href: z.string().nullable().optional(),
});

/**
 * User information.
 * Derived from UserSchema.
 */
export type User = z.infer<typeof UserSchema>;

/**
 * Track information with streaming data.
 * Derived from TrackSchema.
 */
export type Track = z.infer<typeof TrackSchema>;

/**
 * Playlist/album information.
 * Derived from PlaylistSchema.
 */
export type Playlist = z.infer<typeof PlaylistSchema>;

/**
 * Track search results.
 * Derived from TrackSearchResultSchema.
 */
export type TrackSearchResult = z.infer<typeof TrackSearchResultSchema>;

/**
 * Playlist search results.
 * Derived from PlaylistSearchResultSchema.
 */
export type PlaylistSearchResult = z.infer<typeof PlaylistSearchResultSchema>;
