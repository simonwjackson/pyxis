/**
 * @module musicbrainz/schemas
 * Zod schemas for MusicBrainz API response validation.
 * Based on the official MusicBrainz web service API.
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import { z } from "zod";

/**
 * Schema for artist credit entries.
 * Represents how an artist is credited on a release or recording.
 */
export const ArtistCreditSchema = z.object({
	/** Artist information */
	artist: z.object({
		/** MusicBrainz artist ID (UUID) */
		id: z.string(),
		/** Artist name */
		name: z.string(),
		/** Sort name (e.g., "Beatles, The") */
		"sort-name": z.string().optional(),
	}),
	/** Credited name (may differ from artist name) */
	name: z.string().optional(),
	/** Join phrase between multiple artists (e.g., " & ", " feat. ") */
	joinphrase: z.string().optional(),
});

/**
 * Schema for life span (active period) information.
 * Used for artists, groups, and other entities with temporal bounds.
 */
export const LifeSpanSchema = z.object({
	/** Begin date (YYYY, YYYY-MM, or YYYY-MM-DD) */
	begin: z.string().nullish(),
	/** End date (YYYY, YYYY-MM, or YYYY-MM-DD) */
	end: z.string().nullish(),
	/** Whether the entity has ended (disbanded, died, etc.) */
	ended: z.boolean().nullish(),
});

/**
 * Schema for artist information.
 * Contains basic artist metadata and search score.
 */
export const ArtistSchema = z.object({
	/** MusicBrainz artist ID (UUID) */
	id: z.string(),
	/** Artist name */
	name: z.string(),
	/** Sort name for alphabetical ordering */
	"sort-name": z.string().optional(),
	/** Disambiguation comment (for artists with same name) */
	disambiguation: z.string().optional(),
	/** Country code (ISO 3166-1 alpha-2) */
	country: z.string().optional(),
	/** Search relevance score (0-100) */
	score: z.number().optional(),
	/** Artist type (Person, Group, Orchestra, etc.) */
	type: z.string().optional(),
	/** Active period information */
	"life-span": LifeSpanSchema.optional(),
});

/**
 * Schema for tag information (genres, descriptors).
 * Contains tag name and vote count.
 */
export const TagSchema = z.object({
	/** Number of users who tagged with this value */
	count: z.number(),
	/** Tag/genre name */
	name: z.string(),
});

/**
 * Schema for release group (album, EP, single).
 * Represents a collection of related releases.
 */
export const ReleaseGroupSchema = z.object({
	/** MusicBrainz release group ID (UUID) */
	id: z.string(),
	/** Release group title */
	title: z.string().optional(),
	/** Primary type (Album, EP, Single, etc.) */
	"primary-type": z.string().optional(),
	/** Secondary types (Compilation, Live, Remix, etc.) */
	"secondary-types": z.array(z.string()).optional(),
	/** First release date (YYYY, YYYY-MM, or YYYY-MM-DD) */
	"first-release-date": z.string().optional(),
	/** Artist credits for this release group */
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	/** Search relevance score (0-100) */
	score: z.number().optional(),
	/** User-submitted tags/genres */
	tags: z.array(TagSchema).optional(),
});

/**
 * Schema for release group search results.
 * Contains pagination info and array of release groups.
 */
export const ReleaseGroupSearchResultSchema = z.object({
	/** ISO timestamp of when search was created */
	created: z.string().optional(),
	/** Total number of matching results */
	count: z.number(),
	/** Offset into results (for pagination) */
	offset: z.number(),
	/** Array of matching release groups */
	"release-groups": z.array(ReleaseGroupSchema),
});

/**
 * Schema for release (specific edition of a release group).
 * Represents a particular pressing/edition.
 */
export const ReleaseSchema = z.object({
	/** MusicBrainz release ID (UUID) */
	id: z.string(),
	/** Release title */
	title: z.string(),
	/** Release status (Official, Bootleg, Promotion, etc.) */
	status: z.string().optional(),
	/** Release date (YYYY, YYYY-MM, or YYYY-MM-DD) */
	date: z.string().optional(),
	/** Country code (ISO 3166-1 alpha-2) */
	country: z.string().optional(),
	/** Parent release group */
	"release-group": ReleaseGroupSchema.optional(),
	/** Artist credits */
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	/** Search relevance score (0-100) */
	score: z.number().optional(),
});

/**
 * Schema for recording (individual track).
 * Represents a unique audio recording.
 */
export const RecordingSchema = z.object({
	/** MusicBrainz recording ID (UUID) */
	id: z.string(),
	/** Recording title */
	title: z.string(),
	/** Duration in milliseconds */
	length: z.number().optional(),
	/** Artist credits */
	"artist-credit": z.array(ArtistCreditSchema).optional(),
	/** Releases this recording appears on */
	releases: z.array(ReleaseSchema).optional(),
	/** Search relevance score (0-100) */
	score: z.number().optional(),
});

/**
 * Schema for artist search results.
 * Contains pagination info and array of artists.
 */
export const ArtistSearchResultSchema = z.object({
	/** ISO timestamp of when search was created */
	created: z.string().optional(),
	/** Total number of matching results */
	count: z.number(),
	/** Offset into results (for pagination) */
	offset: z.number(),
	/** Array of matching artists */
	artists: z.array(ArtistSchema),
});

/**
 * Schema for release search results.
 * Contains pagination info and array of releases.
 */
export const ReleaseSearchResultSchema = z.object({
	/** ISO timestamp of when search was created */
	created: z.string().optional(),
	/** Total number of matching results */
	count: z.number(),
	/** Offset into results (for pagination) */
	offset: z.number(),
	/** Array of matching releases */
	releases: z.array(ReleaseSchema),
});

/**
 * Schema for recording search results.
 * Contains pagination info and array of recordings.
 */
export const RecordingSearchResultSchema = z.object({
	/** ISO timestamp of when search was created */
	created: z.string().optional(),
	/** Total number of matching results */
	count: z.number(),
	/** Offset into results (for pagination) */
	offset: z.number(),
	/** Array of matching recordings */
	recordings: z.array(RecordingSchema),
});

/**
 * Artist information.
 * Derived from ArtistSchema.
 */
export type Artist = z.infer<typeof ArtistSchema>;

/**
 * Artist credit entry.
 * Derived from ArtistCreditSchema.
 */
export type ArtistCredit = z.infer<typeof ArtistCreditSchema>;

/**
 * Release (specific edition).
 * Derived from ReleaseSchema.
 */
export type Release = z.infer<typeof ReleaseSchema>;

/**
 * Release group (album/EP/single).
 * Derived from ReleaseGroupSchema.
 */
export type ReleaseGroup = z.infer<typeof ReleaseGroupSchema>;

/**
 * Recording (individual track).
 * Derived from RecordingSchema.
 */
export type Recording = z.infer<typeof RecordingSchema>;

/**
 * Artist search results.
 * Derived from ArtistSearchResultSchema.
 */
export type ArtistSearchResult = z.infer<typeof ArtistSearchResultSchema>;

/**
 * Release search results.
 * Derived from ReleaseSearchResultSchema.
 */
export type ReleaseSearchResult = z.infer<typeof ReleaseSearchResultSchema>;

/**
 * Release group search results.
 * Derived from ReleaseGroupSearchResultSchema.
 */
export type ReleaseGroupSearchResult = z.infer<
	typeof ReleaseGroupSearchResultSchema
>;

/**
 * Recording search results.
 * Derived from RecordingSearchResultSchema.
 */
export type RecordingSearchResult = z.infer<typeof RecordingSearchResultSchema>;
