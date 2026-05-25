import { Schema } from "effect";
import { StreamUrlSchema, TrackIdInputSchema } from "./common.js";

const TrackCapabilitiesSchema = Schema.Struct({
	feedback: Schema.Boolean,
	sleep: Schema.Boolean,
	bookmark: Schema.Boolean,
	explain: Schema.Boolean,
	radio: Schema.Boolean,
});

export const TrackIdRequestSchema = Schema.Struct({ id: TrackIdInputSchema });
export type ApiTrackIdRequest = Schema.Schema.Type<typeof TrackIdRequestSchema>;

export const TrackMetadataSchema = Schema.Struct({
	id: Schema.String,
	capabilities: TrackCapabilitiesSchema,
});
export type ApiTrackMetadata = Schema.Schema.Type<typeof TrackMetadataSchema>;

export const TrackStreamUrlInputSchema = Schema.Struct({
	id: TrackIdInputSchema,
	nextId: Schema.optionalKey(TrackIdInputSchema),
});
export type ApiTrackStreamUrlInput = Schema.Schema.Type<
	typeof TrackStreamUrlInputSchema
>;

export const TrackStreamUrlResponseSchema = Schema.Struct({
	url: StreamUrlSchema,
});
export type ApiTrackStreamUrlResponse = Schema.Schema.Type<
	typeof TrackStreamUrlResponseSchema
>;

export const TrackFeedbackInputSchema = Schema.Struct({
	id: TrackIdInputSchema,
	radioId: Schema.String.check(Schema.isMinLength(1)),
	positive: Schema.Boolean,
});
export type ApiTrackFeedbackInput = Schema.Schema.Type<
	typeof TrackFeedbackInputSchema
>;

export const TrackFeedbackResultSchema = Schema.Struct({
	feedbackId: Schema.String,
	songName: Schema.String,
	artistName: Schema.String,
});
export type ApiTrackFeedbackResult = Schema.Schema.Type<
	typeof TrackFeedbackResultSchema
>;

export const RemoveTrackFeedbackInputSchema = Schema.Struct({
	feedbackId: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiRemoveTrackFeedbackInput = Schema.Schema.Type<
	typeof RemoveTrackFeedbackInputSchema
>;

export const TrackSleepInputSchema = Schema.Struct({ id: TrackIdInputSchema });
export type ApiTrackSleepInput = Schema.Schema.Type<
	typeof TrackSleepInputSchema
>;

export const TrackTraitSchema = Schema.Struct({
	traitId: Schema.String,
	traitName: Schema.String,
});

export const TrackExplainResponseSchema = Schema.Struct({
	explanations: Schema.Array(TrackTraitSchema),
});
export type ApiTrackExplainResponse = Schema.Schema.Type<
	typeof TrackExplainResponseSchema
>;
