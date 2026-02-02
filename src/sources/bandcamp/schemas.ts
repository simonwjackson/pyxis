import { z } from "zod";

/**
 * Bandcamp API Schemas
 * Based on public/mobile API endpoints discovered via network inspection
 */

const SearchItemTypeSchema = z.enum(["b", "a", "t", "l", "f"]);

export const AutocompleteItemSchema = z.object({
	type: SearchItemTypeSchema,
	id: z.number(),
	name: z.string(),
	art_id: z.number().nullable().optional(),
	img_id: z.number().nullable().optional(),
	img: z.string().optional(),
	item_url_root: z.string().optional(),
	item_url_path: z.string().optional(),
	location: z.string().nullable().optional(),
	is_label: z.boolean().optional(),
	tag_names: z.array(z.string()).nullable().optional(),
	genre_name: z.string().nullable().optional(),
	band_id: z.number().optional(),
	band_name: z.string().optional(),
});

export const AutocompleteResultSchema = z.object({
	auto: z.object({
		results: z.array(AutocompleteItemSchema),
	}),
});

// Mobile API band info
export const BandInfoSchema = z.object({
	band_id: z.number(),
	name: z.string(),
	image_id: z.number().nullable().optional(),
	bio: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
});

// Streaming URL can be null, or an object with mp3-128 key
const StreamingUrlSchema = z.union([
	z.null(),
	z.object({
		"mp3-128": z.string().optional(),
	}),
]);

// Tag object from album details
export const TagSchema = z.object({
	name: z.string(),
	norm_name: z.string().optional(),
	url: z.string().optional(),
	isloc: z.boolean().optional(),
});

// Mobile API track
export const TrackSchema = z.object({
	track_id: z.number(),
	title: z.string(),
	track_num: z.number().nullable().optional(),
	duration: z.number().nullable().optional(), // seconds (with decimals)
	streaming_url: StreamingUrlSchema.optional(),
	is_streamable: z.boolean().optional(),
	has_lyrics: z.boolean().optional(),
	album_id: z.number().nullable().optional(),
	band_id: z.number().optional(),
	band_name: z.string().optional(),
	art_id: z.number().nullable().optional(),
	album_title: z.string().nullable().optional(),
	label: z.string().nullable().optional(),
	label_id: z.number().nullable().optional(),
});

// Mobile API album/track details response
export const TralbumDetailsSchema = z.object({
	id: z.number(),
	type: z.enum(["a", "t"]), // album or track
	title: z.string(),
	bandcamp_url: z.string().optional(),
	art_id: z.number().nullable().optional(),
	tralbum_artist: z.string().optional(),
	band: BandInfoSchema.optional(),
	tracks: z.array(TrackSchema).optional(),
	about: z.string().nullable().optional(),
	credits: z.string().nullable().optional(),
	release_date: z.number().nullable().optional(), // Unix timestamp
	tags: z.array(TagSchema).optional(),
});

// Type exports (derived from schemas)
export type SearchItemType = z.infer<typeof SearchItemTypeSchema>;
export type AutocompleteItem = z.infer<typeof AutocompleteItemSchema>;
export type AutocompleteResult = z.infer<typeof AutocompleteResultSchema>;
export type BandInfo = z.infer<typeof BandInfoSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type TralbumDetails = z.infer<typeof TralbumDetailsSchema>;
