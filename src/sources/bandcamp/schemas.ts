/**
 * @module bandcamp/schemas
 * Zod schemas for Bandcamp API response validation.
 * Based on public/mobile API endpoints discovered via network inspection.
 */

import { z } from "zod";

/**
 * Search item type codes used in Bandcamp autocomplete results.
 * - "b" = band/artist
 * - "a" = album
 * - "t" = track
 * - "l" = label
 * - "f" = fan
 */
const SearchItemTypeSchema = z.enum(["b", "a", "t", "l", "f"]);

/**
 * Schema for a single autocomplete search result item.
 * Contains basic metadata for bands, albums, tracks, labels, or fans.
 */
export const AutocompleteItemSchema = z.object({
	/** Item type: band (b), album (a), track (t), label (l), or fan (f) */
	type: SearchItemTypeSchema,
	/** Unique identifier for this item */
	id: z.number(),
	/** Display name of the item */
	name: z.string(),
	/** Artwork ID for albums/tracks (use with getArtworkUrl) */
	art_id: z.number().nullable().optional(),
	/** Image ID for bands/labels */
	img_id: z.number().nullable().optional(),
	/** Direct image URL if available */
	img: z.string().optional(),
	/** Base URL for the item (e.g., "https://artist.bandcamp.com") */
	item_url_root: z.string().optional(),
	/** Path segment for the item URL (e.g., "/album/album-name") */
	item_url_path: z.string().optional(),
	/** Geographic location for bands/artists */
	location: z.string().nullable().optional(),
	/** Whether this band is actually a label */
	is_label: z.boolean().optional(),
	/** Tags associated with this item */
	tag_names: z.array(z.string()).nullable().optional(),
	/** Primary genre name */
	genre_name: z.string().nullable().optional(),
	/** Parent band ID for tracks/albums */
	band_id: z.number().optional(),
	/** Parent band name for tracks/albums */
	band_name: z.string().optional(),
});

/**
 * Schema for the autocomplete API response.
 * Contains the search results array nested under auto.results.
 */
export const AutocompleteResultSchema = z.object({
	auto: z.object({
		results: z.array(AutocompleteItemSchema),
	}),
});

/**
 * Schema for band/artist information from mobile API.
 * Contains basic artist metadata.
 */
export const BandInfoSchema = z.object({
	/** Unique band/artist ID */
	band_id: z.number(),
	/** Band/artist display name */
	name: z.string(),
	/** Image ID for artist photo */
	image_id: z.number().nullable().optional(),
	/** Artist biography text */
	bio: z.string().nullable().optional(),
	/** Geographic location */
	location: z.string().nullable().optional(),
});

/**
 * Schema for streaming URL object.
 * Can be null or contain an mp3-128 streaming URL.
 */
const StreamingUrlSchema = z.union([
	z.null(),
	z.object({
		/** MP3 128kbps streaming URL */
		"mp3-128": z.string().optional(),
	}),
]);

/**
 * Schema for tag metadata from album details.
 * Contains normalized and display versions of tag names.
 */
export const TagSchema = z.object({
	/** Display name of the tag */
	name: z.string(),
	/** Normalized (URL-safe) version of the tag name */
	norm_name: z.string().optional(),
	/** URL to the tag page on Bandcamp */
	url: z.string().optional(),
	/** Whether this is a location-based tag */
	isloc: z.boolean().optional(),
});

/**
 * Schema for track information from mobile API.
 * Contains playback metadata and streaming URL.
 */
export const TrackSchema = z.object({
	/** Unique track ID */
	track_id: z.number(),
	/** Track title */
	title: z.string(),
	/** Track number in album (1-indexed) */
	track_num: z.number().nullable().optional(),
	/** Duration in seconds (with decimal precision) */
	duration: z.number().nullable().optional(),
	/** Streaming URL object containing mp3-128 URL */
	streaming_url: StreamingUrlSchema.optional(),
	/** Whether this track can be streamed */
	is_streamable: z.boolean().optional(),
	/** Whether lyrics are available */
	has_lyrics: z.boolean().optional(),
	/** Parent album ID */
	album_id: z.number().nullable().optional(),
	/** Parent band/artist ID */
	band_id: z.number().optional(),
	/** Band/artist name */
	band_name: z.string().optional(),
	/** Artwork ID for track-specific art */
	art_id: z.number().nullable().optional(),
	/** Parent album title */
	album_title: z.string().nullable().optional(),
	/** Record label name */
	label: z.string().nullable().optional(),
	/** Record label ID */
	label_id: z.number().nullable().optional(),
});

/**
 * Schema for album or track details from mobile API.
 * The "tralbum" term is Bandcamp's internal name for track-or-album.
 */
export const TralbumDetailsSchema = z.object({
	/** Unique ID for this album or track */
	id: z.number(),
	/** Type: "a" for album, "t" for track */
	type: z.enum(["a", "t"]),
	/** Album or track title */
	title: z.string(),
	/** Full Bandcamp URL */
	bandcamp_url: z.string().optional(),
	/** Artwork ID (use with getArtworkUrl) */
	art_id: z.number().nullable().optional(),
	/** Artist name for this release */
	tralbum_artist: z.string().optional(),
	/** Band/artist information */
	band: BandInfoSchema.optional(),
	/** Track listing (for albums) or single track (for tracks) */
	tracks: z.array(TrackSchema).optional(),
	/** Description/about text */
	about: z.string().nullable().optional(),
	/** Credits text */
	credits: z.string().nullable().optional(),
	/** Release date as Unix timestamp (seconds) */
	release_date: z.number().nullable().optional(),
	/** Associated tags/genres */
	tags: z.array(TagSchema).optional(),
});

/**
 * Search item type codes.
 * Derived from SearchItemTypeSchema.
 */
export type SearchItemType = z.infer<typeof SearchItemTypeSchema>;

/**
 * Autocomplete search result item.
 * Derived from AutocompleteItemSchema.
 */
export type AutocompleteItem = z.infer<typeof AutocompleteItemSchema>;

/**
 * Autocomplete API response.
 * Derived from AutocompleteResultSchema.
 */
export type AutocompleteResult = z.infer<typeof AutocompleteResultSchema>;

/**
 * Band/artist information.
 * Derived from BandInfoSchema.
 */
export type BandInfo = z.infer<typeof BandInfoSchema>;

/**
 * Tag metadata.
 * Derived from TagSchema.
 */
export type Tag = z.infer<typeof TagSchema>;

/**
 * Track information with streaming data.
 * Derived from TrackSchema.
 */
export type Track = z.infer<typeof TrackSchema>;

/**
 * Album or track details response.
 * Derived from TralbumDetailsSchema.
 */
export type TralbumDetails = z.infer<typeof TralbumDetailsSchema>;
