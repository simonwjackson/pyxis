import { Schema } from "effect";

export const SearchInputSchema = Schema.Struct({
	query: Schema.String.check(Schema.isMinLength(1)),
});

export const TrackCapabilitiesSchema = Schema.Struct({
	feedback: Schema.Boolean,
	sleep: Schema.Boolean,
	bookmark: Schema.Boolean,
	explain: Schema.Boolean,
	radio: Schema.Boolean,
});

export const SearchTrackSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
	capabilities: TrackCapabilitiesSchema,
});

export const SearchAlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	year: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
	sourceIds: Schema.Array(Schema.String),
	genres: Schema.optionalKey(Schema.Array(Schema.String)),
	releaseType: Schema.optionalKey(
		Schema.Literals([
			"album",
			"ep",
			"single",
			"compilation",
			"soundtrack",
			"live",
			"remix",
			"other",
		]),
	),
});

export const SearchResponseSchema = Schema.Struct({
	tracks: Schema.Array(SearchTrackSchema),
	albums: Schema.Array(SearchAlbumSchema),
	pandoraArtists: Schema.Array(Schema.Unknown),
	pandoraGenres: Schema.Array(Schema.Unknown),
});
