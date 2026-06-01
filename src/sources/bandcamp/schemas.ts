/**
 * @module bandcamp/schemas
 * Effect schemas for Bandcamp API response validation.
 * Based on public/mobile API endpoints discovered via network inspection.
 */

import { Schema } from "effect";
import { withDecoders } from "../schema.js";

/**
 * Search item type codes used in Bandcamp autocomplete results.
 * - "b" = band/artist
 * - "a" = album
 * - "t" = track
 * - "l" = label
 * - "f" = fan
 */
const SearchItemTypeSchema = Schema.Literals(["b", "a", "t", "l", "f"]);

/**
 * Schema for a single autocomplete search result item.
 * Contains basic metadata for bands, albums, tracks, labels, or fans.
 */
export const AutocompleteItemSchema = withDecoders(
  Schema.Struct({
    /** Item type: band (b), album (a), track (t), label (l), or fan (f) */
    type: SearchItemTypeSchema,
    /** Unique identifier for this item */
    id: Schema.Number,
    /** Display name of the item */
    name: Schema.String,
    /** Artwork ID for albums/tracks (use with getArtworkUrl) */
    art_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Image ID for bands/labels */
    img_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Direct image URL if available */
    img: Schema.optionalKey(Schema.String),
    /** Base URL for the item (e.g., "https://artist.bandcamp.com") */
    item_url_root: Schema.optionalKey(Schema.String),
    /** Path segment for the item URL (e.g., "/album/album-name") */
    item_url_path: Schema.optionalKey(Schema.String),
    /** Geographic location for bands/artists */
    location: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Whether this band is actually a label */
    is_label: Schema.optionalKey(Schema.Boolean),
    /** Tags associated with this item */
    tag_names: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
    /** Primary genre name */
    genre_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Parent band ID for tracks/albums */
    band_id: Schema.optionalKey(Schema.Number),
    /** Parent band name for tracks/albums */
    band_name: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Schema for the autocomplete API response.
 * Contains the search results array nested under auto.results.
 */
export const AutocompleteResultSchema = withDecoders(
  Schema.Struct({
    auto: Schema.Struct({
      results: Schema.Array(AutocompleteItemSchema),
    }),
  }),
);

/**
 * Schema for band/artist information from mobile API.
 * Contains basic artist metadata.
 */
export const BandInfoSchema = withDecoders(
  Schema.Struct({
    /** Unique band/artist ID */
    band_id: Schema.Number,
    /** Band/artist display name */
    name: Schema.String,
    /** Image ID for artist photo */
    image_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Artist biography text */
    bio: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Geographic location */
    location: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
);

/**
 * Schema for streaming URL object.
 * Can be null or contain an mp3-128 streaming URL.
 */
const StreamingUrlSchema = Schema.Union([
  Schema.Null,
  Schema.Struct({
    /** MP3 128kbps streaming URL */
    "mp3-128": Schema.optionalKey(Schema.String),
  }),
]);

/**
 * Schema for tag metadata from album details.
 * Contains normalized and display versions of tag names.
 */
const BandcampTagSchema = withDecoders(
  Schema.Struct({
    /** Display name of the tag */
    name: Schema.String,
    /** Normalized (URL-safe) version of the tag name */
    norm_name: Schema.optionalKey(Schema.String),
    /** URL to the tag page on Bandcamp */
    url: Schema.optionalKey(Schema.String),
    /** Whether this is a location-based tag */
    isloc: Schema.optionalKey(Schema.Boolean),
  }),
);

/**
 * Schema for track information from mobile API.
 * Contains playback metadata and streaming URL.
 */
const BandcampTrackSchema = withDecoders(
  Schema.Struct({
    /** Unique track ID */
    track_id: Schema.Number,
    /** Track title */
    title: Schema.String,
    /** Track number in album (1-indexed) */
    track_num: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Duration in seconds (with decimal precision) */
    duration: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Streaming URL object containing mp3-128 URL */
    streaming_url: Schema.optionalKey(StreamingUrlSchema),
    /** Whether this track can be streamed */
    is_streamable: Schema.optionalKey(Schema.Boolean),
    /** Whether lyrics are available */
    has_lyrics: Schema.optionalKey(Schema.Boolean),
    /** Parent album ID */
    album_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Parent band/artist ID */
    band_id: Schema.optionalKey(Schema.Number),
    /** Band/artist name */
    band_name: Schema.optionalKey(Schema.String),
    /** Artwork ID for track-specific art */
    art_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Parent album title */
    album_title: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Record label name */
    label: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Record label ID */
    label_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  }),
);

/**
 * Schema for album or track details from mobile API.
 * The "tralbum" term is Bandcamp's internal name for track-or-album.
 */
export const TralbumDetailsSchema = withDecoders(
  Schema.Struct({
    /** Unique ID for this album or track */
    id: Schema.Number,
    /** Type: "a" for album, "t" for track */
    type: Schema.Literals(["a", "t"]),
    /** Album or track title */
    title: Schema.String,
    /** Full Bandcamp URL */
    bandcamp_url: Schema.optionalKey(Schema.String),
    /** Artwork ID (use with getArtworkUrl) */
    art_id: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Artist name for this release */
    tralbum_artist: Schema.optionalKey(Schema.String),
    /** Band/artist information */
    band: Schema.optionalKey(BandInfoSchema),
    /** Track listing (for albums) or single track (for tracks) */
    tracks: Schema.optionalKey(Schema.Array(BandcampTrackSchema)),
    /** Description/about text */
    about: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Credits text */
    credits: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Release date as Unix timestamp (seconds) */
    release_date: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    /** Associated tags/genres */
    tags: Schema.optionalKey(Schema.Array(BandcampTagSchema)),
  }),
);

/**
 * Search item type codes.
 * Derived from SearchItemTypeSchema.
 */
export type SearchItemType = Schema.Schema.Type<typeof SearchItemTypeSchema>;

/**
 * Autocomplete search result item.
 * Derived from AutocompleteItemSchema.
 */
export type AutocompleteItem = Schema.Schema.Type<
  typeof AutocompleteItemSchema
>;

/**
 * Autocomplete API response.
 * Derived from AutocompleteResultSchema.
 */
export type AutocompleteResult = Schema.Schema.Type<
  typeof AutocompleteResultSchema
>;

/**
 * Band/artist information.
 * Derived from BandInfoSchema.
 */
export type BandInfo = Schema.Schema.Type<typeof BandInfoSchema>;

/**
 * Track information with streaming data.
 * Derived from BandcampTrackSchema.
 */
export type BandcampTrack = Schema.Schema.Type<typeof BandcampTrackSchema>;

/**
 * Album or track details response.
 * Derived from TralbumDetailsSchema.
 */
export type TralbumDetails = Schema.Schema.Type<typeof TralbumDetailsSchema>;
