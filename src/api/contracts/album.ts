import { Schema } from "effect";

/**
 * Source album endpoints (`album.get`, `album.tracks`, `album.getWithTracks`)
 * always require a source-prefixed composite id so the source manager knows
 * which provider to query. Bare nanoids are rejected at the wire boundary.
 */
export const SourceAlbumIdInputSchema = Schema.Struct({
	id: Schema.String.check(
		Schema.isMinLength(3),
		Schema.makeFilter((value) =>
			value.includes(":") &&
			value.indexOf(":") > 0 &&
			value.indexOf(":") < value.length - 1
				? undefined
				: {
						path: [],
						issue: "source album id must be a source-prefixed composite id",
					},
		),
	),
});
export type ApiSourceAlbumIdInput = Schema.Schema.Type<
	typeof SourceAlbumIdInputSchema
>;

const TrackCapabilitiesSchema = Schema.Struct({
	feedback: Schema.Boolean,
	sleep: Schema.Boolean,
	bookmark: Schema.Boolean,
	explain: Schema.Boolean,
	radio: Schema.Boolean,
});

export const SourceAlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	year: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
});
export type ApiSourceAlbum = Schema.Schema.Type<typeof SourceAlbumSchema>;

export const SourceAlbumTrackSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
});
export type ApiSourceAlbumTrack = Schema.Schema.Type<
	typeof SourceAlbumTrackSchema
>;

export const SourceAlbumTrackListSchema = Schema.Array(SourceAlbumTrackSchema);

/**
 * `album.getWithTracks` is the active album-detail surface and must keep its
 * batched album + indexed-track shape: a single source manager call powers
 * both the album header and the track list without two upstream round trips.
 */
export const SourceAlbumWithTracksSchema = Schema.Struct({
	album: SourceAlbumSchema,
	tracks: Schema.Array(
		Schema.Struct({
			id: Schema.String,
			trackIndex: Schema.Number,
			title: Schema.String,
			artist: Schema.String,
			album: Schema.String,
			duration: Schema.optionalKey(Schema.Number),
			artworkUrl: Schema.optionalKey(Schema.String),
			capabilities: TrackCapabilitiesSchema,
		}),
	),
});
export type ApiSourceAlbumWithTracks = Schema.Schema.Type<
	typeof SourceAlbumWithTracksSchema
>;
