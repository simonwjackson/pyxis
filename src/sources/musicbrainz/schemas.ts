/**
 * @module musicbrainz/schemas
 * Effect schemas for MusicBrainz API response validation.
 * Based on the official MusicBrainz web service API.
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import { Schema } from "effect";
import { withDecoders } from "../schema.js";

const OptionalNullableString = Schema.optionalKey(Schema.NullOr(Schema.String));
const OptionalNullableBoolean = Schema.optionalKey(
  Schema.NullOr(Schema.Boolean),
);

/**
 * Schema for artist credit entries.
 * Represents how an artist is credited on a release or recording.
 */
export const ArtistCreditSchema = withDecoders(
  Schema.Struct({
    /** Artist information */
    artist: Schema.Struct({
      /** MusicBrainz artist ID (UUID) */
      id: Schema.String,
      /** Artist name */
      name: Schema.String,
      /** Sort name (e.g., "Beatles, The") */
      "sort-name": Schema.optionalKey(Schema.String),
    }),
    /** Credited name (may differ from artist name) */
    name: Schema.optionalKey(Schema.String),
    /** Join phrase between multiple artists (e.g., " & ", " feat. ") */
    joinphrase: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Schema for life span (active period) information.
 * Used for artists, groups, and other entities with temporal bounds.
 */
export const LifeSpanSchema = withDecoders(
  Schema.Struct({
    /** Begin date (YYYY, YYYY-MM, or YYYY-MM-DD) */
    begin: OptionalNullableString,
    /** End date (YYYY, YYYY-MM, or YYYY-MM-DD) */
    end: OptionalNullableString,
    /** Whether the entity has ended (disbanded, died, etc.) */
    ended: OptionalNullableBoolean,
  }),
);

/**
 * Schema for artist information.
 * Contains basic artist metadata and search score.
 */
export const ArtistSchema = withDecoders(
  Schema.Struct({
    /** MusicBrainz artist ID (UUID) */
    id: Schema.String,
    /** Artist name */
    name: Schema.String,
    /** Sort name for alphabetical ordering */
    "sort-name": Schema.optionalKey(Schema.String),
    /** Disambiguation comment (for artists with same name) */
    disambiguation: Schema.optionalKey(Schema.String),
    /** Country code (ISO 3166-1 alpha-2) */
    country: Schema.optionalKey(Schema.String),
    /** Search relevance score (0-100) */
    score: Schema.optionalKey(Schema.Number),
    /** Artist type (Person, Group, Orchestra, etc.) */
    type: Schema.optionalKey(Schema.String),
    /** Active period information */
    "life-span": Schema.optionalKey(LifeSpanSchema),
  }),
);

/**
 * Schema for tag information (genres, descriptors).
 * Contains tag name and vote count.
 */
export const TagSchema = withDecoders(
  Schema.Struct({
    /** Number of users who tagged with this value */
    count: Schema.Number,
    /** Tag/genre name */
    name: Schema.String,
  }),
);

/**
 * Schema for release group (album, EP, single).
 * Represents a collection of related releases.
 */
export const ReleaseGroupSchema = withDecoders(
  Schema.Struct({
    /** MusicBrainz release group ID (UUID) */
    id: Schema.String,
    /** Release group title */
    title: Schema.optionalKey(Schema.String),
    /** Primary type (Album, EP, Single, etc.) */
    "primary-type": Schema.optionalKey(Schema.String),
    /** Secondary types (Compilation, Live, Remix, etc.) */
    "secondary-types": Schema.optionalKey(Schema.Array(Schema.String)),
    /** First release date (YYYY, YYYY-MM, or YYYY-MM-DD) */
    "first-release-date": Schema.optionalKey(Schema.String),
    /** Artist credits for this release group */
    "artist-credit": Schema.optionalKey(Schema.Array(ArtistCreditSchema)),
    /** Search relevance score (0-100) */
    score: Schema.optionalKey(Schema.Number),
    /** User-submitted tags/genres */
    tags: Schema.optionalKey(Schema.Array(TagSchema)),
  }),
);

/**
 * Schema for release group search results.
 * Contains pagination info and array of release groups.
 */
export const ReleaseGroupSearchResultSchema = withDecoders(
  Schema.Struct({
    /** ISO timestamp of when search was created */
    created: Schema.optionalKey(Schema.String),
    /** Total number of matching results */
    count: Schema.Number,
    /** Offset into results (for pagination) */
    offset: Schema.Number,
    /** Array of matching release groups */
    "release-groups": Schema.Array(ReleaseGroupSchema),
  }),
);

/**
 * Schema for release (specific edition of a release group).
 * Represents a particular pressing/edition.
 */
export const ReleaseSchema = withDecoders(
  Schema.Struct({
    /** MusicBrainz release ID (UUID) */
    id: Schema.String,
    /** Release title */
    title: Schema.String,
    /** Release status (Official, Bootleg, Promotion, etc.) */
    status: Schema.optionalKey(Schema.String),
    /** Release date (YYYY, YYYY-MM, or YYYY-MM-DD) */
    date: Schema.optionalKey(Schema.String),
    /** Country code (ISO 3166-1 alpha-2) */
    country: Schema.optionalKey(Schema.String),
    /** Parent release group */
    "release-group": Schema.optionalKey(ReleaseGroupSchema),
    /** Artist credits */
    "artist-credit": Schema.optionalKey(Schema.Array(ArtistCreditSchema)),
    /** Search relevance score (0-100) */
    score: Schema.optionalKey(Schema.Number),
  }),
);

/**
 * Schema for recording (individual track).
 * Represents a unique audio recording.
 */
export const RecordingSchema = withDecoders(
  Schema.Struct({
    /** MusicBrainz recording ID (UUID) */
    id: Schema.String,
    /** Recording title */
    title: Schema.String,
    /** Duration in milliseconds */
    length: Schema.optionalKey(Schema.Number),
    /** Artist credits */
    "artist-credit": Schema.optionalKey(Schema.Array(ArtistCreditSchema)),
    /** Releases this recording appears on */
    releases: Schema.optionalKey(Schema.Array(ReleaseSchema)),
    /** Search relevance score (0-100) */
    score: Schema.optionalKey(Schema.Number),
  }),
);

/**
 * Schema for artist search results.
 * Contains pagination info and array of artists.
 */
export const ArtistSearchResultSchema = withDecoders(
  Schema.Struct({
    /** ISO timestamp of when search was created */
    created: Schema.optionalKey(Schema.String),
    /** Total number of matching results */
    count: Schema.Number,
    /** Offset into results (for pagination) */
    offset: Schema.Number,
    /** Array of matching artists */
    artists: Schema.Array(ArtistSchema),
  }),
);

/**
 * Schema for release search results.
 * Contains pagination info and array of releases.
 */
export const ReleaseSearchResultSchema = withDecoders(
  Schema.Struct({
    /** ISO timestamp of when search was created */
    created: Schema.optionalKey(Schema.String),
    /** Total number of matching results */
    count: Schema.Number,
    /** Offset into results (for pagination) */
    offset: Schema.Number,
    /** Array of matching releases */
    releases: Schema.Array(ReleaseSchema),
  }),
);

/**
 * Schema for recording search results.
 * Contains pagination info and array of recordings.
 */
export const RecordingSearchResultSchema = withDecoders(
  Schema.Struct({
    /** ISO timestamp of when search was created */
    created: Schema.optionalKey(Schema.String),
    /** Total number of matching results */
    count: Schema.Number,
    /** Offset into results (for pagination) */
    offset: Schema.Number,
    /** Array of matching recordings */
    recordings: Schema.Array(RecordingSchema),
  }),
);

/**
 * Artist information.
 * Derived from ArtistSchema.
 */
export type Artist = Schema.Schema.Type<typeof ArtistSchema>;

/**
 * Artist credit entry.
 * Derived from ArtistCreditSchema.
 */
export type ArtistCredit = Schema.Schema.Type<typeof ArtistCreditSchema>;

/**
 * Release (specific edition).
 * Derived from ReleaseSchema.
 */
export type Release = Schema.Schema.Type<typeof ReleaseSchema>;

/**
 * Release group (album/EP/single).
 * Derived from ReleaseGroupSchema.
 */
export type ReleaseGroup = Schema.Schema.Type<typeof ReleaseGroupSchema>;

/**
 * Recording (individual track).
 * Derived from RecordingSchema.
 */
export type Recording = Schema.Schema.Type<typeof RecordingSchema>;

/**
 * Artist search results.
 * Derived from ArtistSearchResultSchema.
 */
export type ArtistSearchResult = Schema.Schema.Type<
  typeof ArtistSearchResultSchema
>;

/**
 * Release search results.
 * Derived from ReleaseSearchResultSchema.
 */
export type ReleaseSearchResult = Schema.Schema.Type<
  typeof ReleaseSearchResultSchema
>;

/**
 * Release group search results.
 * Derived from ReleaseGroupSearchResultSchema.
 */
export type ReleaseGroupSearchResult = Schema.Schema.Type<
  typeof ReleaseGroupSearchResultSchema
>;

/**
 * Recording search results.
 * Derived from RecordingSearchResultSchema.
 */
export type RecordingSearchResult = Schema.Schema.Type<
  typeof RecordingSearchResultSchema
>;
