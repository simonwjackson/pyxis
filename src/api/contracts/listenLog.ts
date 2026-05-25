import { Schema } from "effect";
import { CompositeTrackIdSchema, PaginationInputSchema } from "./common.js";

export const ListenLogInputSchema = PaginationInputSchema;
export const ListenLogEntrySchema = Schema.Struct({
	id: Schema.String,
	compositeId: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.optionalKey(Schema.String),
	source: Schema.String,
	listenedAt: Schema.Number,
});
export const ListenLogResponseSchema = Schema.Array(ListenLogEntrySchema);
