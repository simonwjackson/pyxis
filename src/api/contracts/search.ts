import { Schema } from "effect";

export const SearchInputSchema = Schema.Struct({
	query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});
export type ApiSearchInput = Schema.Schema.Type<typeof SearchInputSchema>;

export const PandoraSearchInputSchema = Schema.Struct({
	searchText: Schema.String.check(
		Schema.isMinLength(1),
		Schema.isMaxLength(256),
	),
});
export type ApiPandoraSearchInput = Schema.Schema.Type<
	typeof PandoraSearchInputSchema
>;

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

/**
 * Pandora-specific search result entries (artists, genre stations). The
 * upstream payload carries additional fields the UI does not render; bind
 * only the fields rendered by the UI and strip the rest at the boundary.
 */
export const PandoraSearchArtistSchema = Schema.Struct({
	artistName: Schema.String,
	musicToken: Schema.String,
	score: Schema.optionalKey(Schema.Number),
});
export type ApiPandoraSearchArtist = Schema.Schema.Type<
	typeof PandoraSearchArtistSchema
>;

export const PandoraSearchGenreStationSchema = Schema.Struct({
	stationName: Schema.String,
	musicToken: Schema.String,
	score: Schema.optionalKey(Schema.Number),
});
export type ApiPandoraSearchGenreStation = Schema.Schema.Type<
	typeof PandoraSearchGenreStationSchema
>;

export const PandoraSearchSongSchema = Schema.Struct({
	songName: Schema.String,
	artistName: Schema.String,
	musicToken: Schema.String,
	score: Schema.optionalKey(Schema.Number),
});

export const PandoraSearchResponseSchema = Schema.Struct({
	artists: Schema.optionalKey(Schema.Array(PandoraSearchArtistSchema)),
	songs: Schema.optionalKey(Schema.Array(PandoraSearchSongSchema)),
	genreStations: Schema.optionalKey(
		Schema.Array(PandoraSearchGenreStationSchema),
	),
});
export type ApiPandoraSearchResponse = Schema.Schema.Type<
	typeof PandoraSearchResponseSchema
>;

export const SearchResponseSchema = Schema.Struct({
	tracks: Schema.Array(SearchTrackSchema),
	albums: Schema.Array(SearchAlbumSchema),
	pandoraArtists: Schema.Array(PandoraSearchArtistSchema),
	pandoraGenres: Schema.Array(PandoraSearchGenreStationSchema),
});
export type ApiSearchResponse = Schema.Schema.Type<typeof SearchResponseSchema>;
