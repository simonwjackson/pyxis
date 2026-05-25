import { Schema } from "effect";
import { SourceIdSchema } from "./common.js";

export const SearchInputSchema = Schema.Struct({ query: Schema.String.check(Schema.isMinLength(1)) });
export const SearchTrackSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	sourceId: SourceIdSchema,
});
export const SearchAlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	sourceIds: Schema.Array(SourceIdSchema),
});
export const SearchResponseSchema = Schema.Struct({
	tracks: Schema.Array(SearchTrackSchema),
	albums: Schema.Array(SearchAlbumSchema),
});
