/**
 * @module discogs/schemas
 * Effect schemas for Discogs API response validation.
 * Based on the official Discogs API documentation.
 * @see https://www.discogs.com/developers
 */

import { Schema } from "effect";
import { withDecoders } from "../schema.js";

/**
 * Schema for artist information in releases and tracklists.
 * Contains basic artist metadata and API resource URL.
 */
export const DiscogsArtistSchema = withDecoders(
  Schema.Struct({
    /** Unique Discogs artist ID */
    id: Schema.Number,
    /** Artist display name (may include disambiguation number like "Artist (2)") */
    name: Schema.String,
    /** API URL for this artist resource */
    resource_url: Schema.String,
  }),
);

/**
 * Schema for search result items.
 * Generic search result that can be master, release, artist, or label.
 */
export const DiscogsSearchResultSchema = withDecoders(
  Schema.Struct({
    /** Unique ID for this result */
    id: Schema.Number,
    /** Result type: master, release, artist, or label */
    type: Schema.Literals(["master", "release", "artist", "label"]),
    /** Display title (format varies by type) */
    title: Schema.String,
    /** Small thumbnail image URL */
    thumb: Schema.optionalKey(Schema.String),
    /** Full-size cover image URL */
    cover_image: Schema.optionalKey(Schema.String),
    /** API URL for this resource */
    resource_url: Schema.String,
    /** Discogs website URI path */
    uri: Schema.String,
    /** Country of release */
    country: Schema.optionalKey(Schema.String),
    /** Release year as string */
    year: Schema.optionalKey(Schema.String),
    /** Physical formats (CD, Vinyl, etc.) */
    format: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Record label names */
    label: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Genre classifications */
    genre: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Style/subgenre classifications */
    style: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Associated master release ID */
    master_id: Schema.optionalKey(Schema.Number),
    /** API URL for associated master release */
    master_url: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Schema for pagination metadata in search responses.
 * Contains page info and total counts.
 */
export const DiscogsPaginationSchema = withDecoders(
  Schema.Struct({
    /** Current page number (1-indexed) */
    page: Schema.Number,
    /** Total number of pages */
    pages: Schema.Number,
    /** Results per page */
    per_page: Schema.Number,
    /** Total number of matching items */
    items: Schema.Number,
  }),
);

/**
 * Schema for the search API response.
 * Contains paginated search results.
 */
export const DiscogsSearchResponseSchema = withDecoders(
  Schema.Struct({
    /** Pagination metadata */
    pagination: DiscogsPaginationSchema,
    /** Array of search results */
    results: Schema.Array(DiscogsSearchResultSchema),
  }),
);

/**
 * Schema for tracklist items in master releases.
 * Contains track position, title, and optional duration.
 */
export const DiscogsTracklistItemSchema = withDecoders(
  Schema.Struct({
    /** Track position (e.g., "A1", "B2", "1", "2") */
    position: Schema.String,
    /** Track title */
    title: Schema.String,
    /** Track duration in "mm:ss" format */
    duration: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Schema for master release details.
 * Contains full album/release information including tracklist.
 */
export const DiscogsMasterSchema = withDecoders(
  Schema.Struct({
    /** Unique master release ID */
    id: Schema.Number,
    /** Album/release title */
    title: Schema.String,
    /** Release year */
    year: Schema.optionalKey(Schema.Number),
    /** Artists credited on this release */
    artists: Schema.Array(DiscogsArtistSchema),
    /** Genre classifications */
    genres: Schema.Array(Schema.String),
    /** Style/subgenre classifications */
    styles: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Complete tracklist */
    tracklist: Schema.Array(DiscogsTracklistItemSchema),
    /** ID of the main/primary release version */
    main_release: Schema.Number,
    /** ID of the most recently added release version */
    most_recent_release: Schema.optionalKey(Schema.Number),
    /** Number of copies currently for sale in marketplace */
    num_for_sale: Schema.optionalKey(Schema.Number),
    /** Lowest price in marketplace (null if none for sale) */
    lowest_price: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** API URL for this master release */
    resource_url: Schema.String,
    /** Discogs website URI path */
    uri: Schema.String,
  }),
);

/**
 * Schema for rate limit information from response headers.
 * Used to track API usage and remaining quota.
 */
export const DiscogsRateLimitSchema = withDecoders(
  Schema.Struct({
    /** Maximum requests allowed per minute */
    limit: Schema.Number,
    /** Number of requests used in current window */
    used: Schema.Number,
    /** Remaining requests in current window */
    remaining: Schema.Number,
  }),
);

/**
 * Artist information.
 * Derived from DiscogsArtistSchema.
 */
export type DiscogsArtist = Schema.Schema.Type<typeof DiscogsArtistSchema>;

/**
 * Search result item.
 * Derived from DiscogsSearchResultSchema.
 */
export type DiscogsSearchResult = Schema.Schema.Type<
  typeof DiscogsSearchResultSchema
>;

/**
 * Pagination metadata.
 * Derived from DiscogsPaginationSchema.
 */
export type DiscogsPagination = Schema.Schema.Type<
  typeof DiscogsPaginationSchema
>;

/**
 * Search API response.
 * Derived from DiscogsSearchResponseSchema.
 */
export type DiscogsSearchResponse = Schema.Schema.Type<
  typeof DiscogsSearchResponseSchema
>;

/**
 * Tracklist item.
 * Derived from DiscogsTracklistItemSchema.
 */
export type DiscogsTracklistItem = Schema.Schema.Type<
  typeof DiscogsTracklistItemSchema
>;

/**
 * Master release details.
 * Derived from DiscogsMasterSchema.
 */
export type DiscogsMaster = Schema.Schema.Type<typeof DiscogsMasterSchema>;

/**
 * Rate limit information.
 * Derived from DiscogsRateLimitSchema.
 */
export type DiscogsRateLimit = Schema.Schema.Type<
  typeof DiscogsRateLimitSchema
>;
