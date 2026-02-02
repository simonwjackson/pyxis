import { z } from "zod";

// --- MusicBrainz API Response Schemas ---

export const ArtistCreditSchema = z.object({
	artist: z.object({
		id: z.string(),
		name: z.string(),
		"sort-name": z.string().optional(),
	}),
	name: z.string().optional(),
	joinphrase: z.string().optional(),
});

export const LifeSpanSchema = z.object({
	begin: z.string().nullish(),
	end: z.string().nullish(),
	ended: z.boolean().nullish(),
});

export const ArtistSchema = z.object({
	id: z.string(),
	name: z.string(),
	"sort-name": z.string().optional(),
	disambiguation: z.string().optional(),
	country: z.string().optional(),
	score: z.number().optional(),
	type: z.string().optional(),
	"life-span": LifeSpanSchema.optional(),
});

export const ReleaseGroupSchema = z.object({
	id: z.string(),
	title: z.string().optional(),
	"primary-type": z.string().optional(),
	"secondary-types": z.array(z.string()).optional(),
	"first-release-date": z.string().optional(),
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	score: z.number().optional(),
});

export const ReleaseGroupSearchResultSchema = z.object({
	created: z.string().optional(),
	count: z.number(),
	offset: z.number(),
	"release-groups": z.array(ReleaseGroupSchema),
});

export const ReleaseSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: z.string().optional(),
	date: z.string().optional(),
	country: z.string().optional(),
	"release-group": ReleaseGroupSchema.optional(),
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	score: z.number().optional(),
});

export const RecordingSchema = z.object({
	id: z.string(),
	title: z.string(),
	length: z.number().optional(),
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	releases: z.array(ReleaseSchema).optional(),
	score: z.number().optional(),
});

export const ArtistSearchResultSchema = z.object({
	created: z.string().optional(),
	count: z.number(),
	offset: z.number(),
	artists: z.array(ArtistSchema),
});

export const ReleaseSearchResultSchema = z.object({
	created: z.string().optional(),
	count: z.number(),
	offset: z.number(),
	releases: z.array(ReleaseSchema),
});

export const RecordingSearchResultSchema = z.object({
	created: z.string().optional(),
	count: z.number(),
	offset: z.number(),
	recordings: z.array(RecordingSchema),
});

// --- Derived Types ---

export type Artist = z.infer<typeof ArtistSchema>;
export type ArtistCredit = z.infer<typeof ArtistCreditSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
export type ReleaseGroup = z.infer<typeof ReleaseGroupSchema>;
export type Recording = z.infer<typeof RecordingSchema>;
export type ArtistSearchResult = z.infer<typeof ArtistSearchResultSchema>;
export type ReleaseSearchResult = z.infer<typeof ReleaseSearchResultSchema>;
export type ReleaseGroupSearchResult = z.infer<
	typeof ReleaseGroupSearchResultSchema
>;
export type RecordingSearchResult = z.infer<typeof RecordingSearchResultSchema>;
