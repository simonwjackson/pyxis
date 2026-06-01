/**
 * @module deezer/schemas
 * Effect schemas for Deezer API response validation.
 * Based on public api.deezer.com endpoints.
 * @see https://developers.deezer.com/api
 */

import { Schema } from "effect";
import { withDecoders } from "../schema.js";

/**
 * Schema for minimal artist information in search results.
 * Contains basic artist metadata and image URLs.
 */
export const ArtistMinimalSchema = withDecoders(
  Schema.Struct({
    /** Unique Deezer artist ID */
    id: Schema.Number,
    /** Artist display name */
    name: Schema.String,
    /** URL to the artist page on Deezer */
    link: Schema.optionalKey(Schema.String),
    /** Default artist picture URL */
    picture: Schema.optionalKey(Schema.String),
    /** Small artist picture (56x56) */
    picture_small: Schema.optionalKey(Schema.String),
    /** Medium artist picture (250x250) */
    picture_medium: Schema.optionalKey(Schema.String),
    /** Large artist picture (500x500) */
    picture_big: Schema.optionalKey(Schema.String),
    /** Extra large artist picture (1000x1000) */
    picture_xl: Schema.optionalKey(Schema.String),
    /** URL to the artist's tracklist API endpoint */
    tracklist: Schema.optionalKey(Schema.String),
    /** Resource type identifier */
    type: Schema.optionalKey(Schema.Literal("artist")),
  }),
);

/**
 * Schema for minimal album information.
 * Contains basic album metadata and cover art URLs.
 */
export const AlbumMinimalSchema = withDecoders(
  Schema.Struct({
    /** Unique Deezer album ID */
    id: Schema.Number,
    /** Album title */
    title: Schema.String,
    /** Default album cover URL */
    cover: Schema.optionalKey(Schema.String),
    /** Small album cover (56x56) */
    cover_small: Schema.optionalKey(Schema.String),
    /** Medium album cover (250x250) */
    cover_medium: Schema.optionalKey(Schema.String),
    /** Large album cover (500x500) */
    cover_big: Schema.optionalKey(Schema.String),
    /** Extra large album cover (1000x1000) */
    cover_xl: Schema.optionalKey(Schema.String),
    /** MD5 hash for image generation */
    md5_image: Schema.optionalKey(Schema.String),
    /** URL to the album's tracklist API endpoint */
    tracklist: Schema.optionalKey(Schema.String),
    /** Resource type identifier */
    type: Schema.optionalKey(Schema.Literal("album")),
  }),
);

/**
 * Schema for genre information.
 * Contains genre name and associated picture.
 */
export const GenreSchema = withDecoders(
  Schema.Struct({
    /** Unique Deezer genre ID */
    id: Schema.Number,
    /** Genre display name */
    name: Schema.String,
    /** URL to genre picture */
    picture: Schema.optionalKey(Schema.String),
    /** Resource type identifier */
    type: Schema.optionalKey(Schema.Literal("genre")),
  }),
);

/**
 * Schema for album search result items.
 * Extends minimal album info with additional metadata.
 */
export const AlbumSearchItemSchema = withDecoders(
  Schema.Struct({
    ...AlbumMinimalSchema.fields,
    /** Primary genre ID for the album */
    genre_id: Schema.optionalKey(Schema.Number),
    /** Number of tracks in the album */
    nb_tracks: Schema.optionalKey(Schema.Number),
    /** Album type (album, single, ep, compilation) */
    record_type: Schema.optionalKey(Schema.String),
    /** Whether the album contains explicit lyrics */
    explicit_lyrics: Schema.optionalKey(Schema.Boolean),
    /** Primary artist information */
    artist: Schema.optionalKey(ArtistMinimalSchema),
  }),
);

/**
 * Schema for the album search API response.
 * Contains paginated search results.
 */
export const AlbumSearchResultSchema = withDecoders(
  Schema.Struct({
    /** Array of matching albums */
    data: Schema.Array(AlbumSearchItemSchema),
    /** Total number of matching results */
    total: Schema.optionalKey(Schema.Number),
    /** URL to fetch the next page of results */
    next: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Schema for Deezer API error responses.
 * Used to detect and handle API errors in JSON responses.
 */
export const ErrorResponseSchema = withDecoders(
  Schema.Struct({
    error: Schema.Struct({
      /** Error type identifier */
      type: Schema.String,
      /** Human-readable error message */
      message: Schema.String,
      /** Numeric error code */
      code: Schema.Number,
    }),
  }),
);

/**
 * Minimal artist information.
 * Derived from ArtistMinimalSchema.
 */
export type ArtistMinimal = Schema.Schema.Type<typeof ArtistMinimalSchema>;

/**
 * Minimal album information.
 * Derived from AlbumMinimalSchema.
 */
export type AlbumMinimal = Schema.Schema.Type<typeof AlbumMinimalSchema>;

/**
 * Album search result item with full metadata.
 * Derived from AlbumSearchItemSchema.
 */
export type AlbumSearchItem = Schema.Schema.Type<typeof AlbumSearchItemSchema>;

/**
 * Genre information.
 * Derived from GenreSchema.
 */
export type Genre = Schema.Schema.Type<typeof GenreSchema>;

/**
 * Album search API response.
 * Derived from AlbumSearchResultSchema.
 */
export type AlbumSearchResult = Schema.Schema.Type<
  typeof AlbumSearchResultSchema
>;

/**
 * Deezer API error response.
 * Derived from ErrorResponseSchema.
 */
export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponseSchema>;
