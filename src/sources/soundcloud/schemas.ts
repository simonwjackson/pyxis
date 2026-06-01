/**
 * @module soundcloud/schemas
 * Effect schemas for SoundCloud V2 API response validation.
 * Based on unofficial api-v2.soundcloud.com endpoints.
 */

import { Schema } from "effect";
import { withDecoders } from "../schema.js";

const OptionalNullableString = Schema.optionalKey(Schema.NullOr(Schema.String));
const OptionalNullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number));

/**
 * Schema for SoundCloud user information.
 * Contains basic user profile metadata.
 */
export const UserSchema = withDecoders(
  Schema.Struct({
    /** Unique SoundCloud user ID */
    id: Schema.Number,
    /** Username (display name) */
    username: Schema.String,
    /** URL-safe permalink slug */
    permalink: Schema.optionalKey(Schema.String),
    /** Full permalink URL */
    permalink_url: Schema.optionalKey(Schema.String),
    /** Avatar image URL */
    avatar_url: OptionalNullableString,
    /** City name */
    city: OptionalNullableString,
    /** ISO country code */
    country_code: OptionalNullableString,
    /** User bio/description */
    description: OptionalNullableString,
    /** Number of followers */
    followers_count: Schema.optionalKey(Schema.Number),
    /** Number of users being followed */
    followings_count: Schema.optionalKey(Schema.Number),
    /** Number of tracks uploaded */
    track_count: Schema.optionalKey(Schema.Number),
    /** Number of playlists created */
    playlist_count: Schema.optionalKey(Schema.Number),
    /** Number of likes given */
    likes_count: Schema.optionalKey(Schema.Number),
    /** Whether the user is verified */
    verified: Schema.optionalKey(Schema.Boolean),
    /** First name */
    first_name: OptionalNullableString,
    /** Last name */
    last_name: OptionalNullableString,
    /** Combined full name */
    full_name: OptionalNullableString,
  }),
);

const TranscodingSchema = Schema.Struct({
  /** URL to resolve the stream (requires client_id) */
  url: Schema.String,
  /** Encoding preset name */
  preset: Schema.optionalKey(Schema.String),
  /** Format information */
  format: Schema.optionalKey(
    Schema.Struct({
      /** Protocol: "progressive" for HTTP, "hls" for HLS */
      protocol: Schema.optionalKey(Schema.String),
      /** MIME type (e.g., "audio/mpeg") */
      mime_type: Schema.optionalKey(Schema.String),
    }),
  ),
  /** Quality level */
  quality: Schema.optionalKey(Schema.String),
});

/**
 * Schema for track information with media transcoding.
 * Contains playback metadata and streaming URL resolution data.
 */
export const TrackSchema = withDecoders(
  Schema.Struct({
    /** Unique SoundCloud track ID */
    id: Schema.Number,
    /** Track title */
    title: OptionalNullableString,
    /** URL-safe permalink slug */
    permalink: Schema.optionalKey(Schema.String),
    /** Full permalink URL */
    permalink_url: Schema.optionalKey(Schema.String),
    /** Artwork image URL */
    artwork_url: OptionalNullableString,
    /** Track description */
    description: OptionalNullableString,
    /** Duration in milliseconds */
    duration: OptionalNullableNumber,
    /** Full duration including any intro (milliseconds) */
    full_duration: OptionalNullableNumber,
    /** Genre tag */
    genre: OptionalNullableString,
    /** Number of plays */
    playback_count: OptionalNullableNumber,
    /** Number of likes */
    likes_count: OptionalNullableNumber,
    /** Number of comments */
    comment_count: OptionalNullableNumber,
    /** Number of reposts */
    reposts_count: OptionalNullableNumber,
    /** ISO timestamp of creation */
    created_at: Schema.optionalKey(Schema.String),
    /** Uploader information */
    user: Schema.optionalKey(UserSchema),
    /** Whether the track can be streamed */
    streamable: Schema.optionalKey(Schema.Boolean),
    /** Whether the track can be downloaded */
    downloadable: Schema.optionalKey(Schema.Boolean),
    /** Media transcoding information for stream URL resolution */
    media: Schema.optionalKey(
      Schema.Struct({
        /** Available transcoding formats and their URLs */
        transcodings: Schema.optionalKey(Schema.Array(TranscodingSchema)),
      }),
    ),
  }),
);

/**
 * Schema for playlist/album information.
 * Contains collection metadata and track listing.
 */
export const PlaylistSchema = withDecoders(
  Schema.Struct({
    /** Unique SoundCloud playlist ID */
    id: Schema.Number,
    /** Playlist title */
    title: Schema.String,
    /** URL-safe permalink slug */
    permalink: Schema.optionalKey(Schema.String),
    /** Full permalink URL */
    permalink_url: Schema.optionalKey(Schema.String),
    /** Playlist artwork URL */
    artwork_url: OptionalNullableString,
    /** Playlist description */
    description: OptionalNullableString,
    /** Total duration in milliseconds */
    duration: OptionalNullableNumber,
    /** Number of tracks in the playlist */
    track_count: Schema.optionalKey(Schema.Number),
    /** Number of likes */
    likes_count: OptionalNullableNumber,
    /** Number of reposts */
    reposts_count: OptionalNullableNumber,
    /** ISO timestamp of creation */
    created_at: Schema.optionalKey(Schema.String),
    /** Genre tag */
    genre: OptionalNullableString,
    /** Whether this is marked as an album */
    is_album: Schema.optionalKey(Schema.Boolean),
    /** Set type: "album", "ep", "single", "compilation", or null */
    set_type: OptionalNullableString,
    /** Creator information */
    user: Schema.optionalKey(UserSchema),
    /** Tracks in the playlist (may be stubs requiring full fetch) */
    tracks: Schema.optionalKey(Schema.Array(TrackSchema)),
  }),
);

/**
 * Schema for track search results.
 * Contains paginated collection of matching tracks.
 */
export const TrackSearchResultSchema = withDecoders(
  Schema.Struct({
    /** Array of matching tracks */
    collection: Schema.Array(TrackSchema),
    /** Total number of results */
    total_results: Schema.optionalKey(Schema.Number),
    /** URL to fetch next page (null if no more results) */
    next_href: OptionalNullableString,
  }),
);

/**
 * Schema for playlist/album search results.
 * Contains paginated collection of matching playlists.
 */
export const PlaylistSearchResultSchema = withDecoders(
  Schema.Struct({
    /** Array of matching playlists */
    collection: Schema.Array(PlaylistSchema),
    /** Total number of results */
    total_results: Schema.optionalKey(Schema.Number),
    /** URL to fetch next page (null if no more results) */
    next_href: OptionalNullableString,
  }),
);

/**
 * User information.
 * Derived from UserSchema.
 */
export type User = Schema.Schema.Type<typeof UserSchema>;

/**
 * Track information with streaming data.
 * Derived from TrackSchema.
 */
export type Track = Schema.Schema.Type<typeof TrackSchema>;

/**
 * Playlist/album information.
 * Derived from PlaylistSchema.
 */
export type Playlist = Schema.Schema.Type<typeof PlaylistSchema>;

/**
 * Track search results.
 * Derived from TrackSearchResultSchema.
 */
export type TrackSearchResult = Schema.Schema.Type<
  typeof TrackSearchResultSchema
>;

/**
 * Playlist search results.
 * Derived from PlaylistSearchResultSchema.
 */
export type PlaylistSearchResult = Schema.Schema.Type<
  typeof PlaylistSearchResultSchema
>;
