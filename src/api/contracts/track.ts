import { Schema } from "effect";
import { CompositeTrackIdSchema } from "./common.js";

export const TrackIdInputSchema = Schema.Struct({ id: CompositeTrackIdSchema });
export const TrackTraitSchema = Schema.Struct({
	traitId: Schema.String,
	traitName: Schema.String,
});
export const TrackExplainResponseSchema = Schema.Struct({
	explanations: Schema.Array(TrackTraitSchema),
});
