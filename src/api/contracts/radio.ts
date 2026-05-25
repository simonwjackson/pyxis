import { Schema } from "effect";

export const RadioIdInputSchema = Schema.Struct({ id: Schema.String.check(Schema.isMinLength(1)) });
export const StationSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	artworkUrl: Schema.optionalKey(Schema.String),
});
export const StationListSchema = Schema.Array(StationSchema);
