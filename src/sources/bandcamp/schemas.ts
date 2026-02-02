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

// Type exports (derived from schemas)
export type SearchItemType = z.infer<typeof SearchItemTypeSchema>;
export type AutocompleteItem = z.infer<typeof AutocompleteItemSchema>;
export type AutocompleteResult = z.infer<typeof AutocompleteResultSchema>;
