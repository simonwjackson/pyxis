import { Schema } from "effect";
import { SourceTypeSchema } from "./common.js";

export const PlaylistSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	source: SourceTypeSchema,
	artworkUrl: Schema.optionalKey(Schema.String),
});
export const PlaylistListSchema = Schema.Array(PlaylistSchema);
