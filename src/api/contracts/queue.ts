import { Schema } from "effect";
import { CompositeTrackIdSchema, TrackIdInputSchema } from "./common.js";

export const QueueTrackSchema = Schema.Struct({
	id: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
});
export type ApiQueueTrack = Schema.Schema.Type<typeof QueueTrackSchema>;

export const QueueContextSchema = Schema.Union([
	Schema.Struct({ type: Schema.Literal("manual") }),
	Schema.Struct({
		type: Schema.Literal("radio"),
		seedId: Schema.String.check(Schema.isMinLength(1)),
	}),
	Schema.Struct({
		type: Schema.Literal("album"),
		albumId: Schema.String.check(Schema.isMinLength(1)),
	}),
	Schema.Struct({
		type: Schema.Literal("playlist"),
		playlistId: Schema.String.check(Schema.isMinLength(1)),
	}),
]);
export type ApiQueueContext = Schema.Schema.Type<typeof QueueContextSchema>;

export const QueueStateSchema = Schema.Struct({
	items: Schema.Array(QueueTrackSchema),
	currentIndex: Schema.Finite.check(
		Schema.isInt(),
		Schema.isGreaterThanOrEqualTo(0),
	),
	context: QueueContextSchema,
});
export type ApiQueueState = Schema.Schema.Type<typeof QueueStateSchema>;

// --- Inputs ---------------------------------------------------------------

export const QueueAddTrackInputSchema = Schema.Struct({
	id: TrackIdInputSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
});
export type ApiQueueAddTrackInput = Schema.Schema.Type<
	typeof QueueAddTrackInputSchema
>;

export const QueueAddInputSchema = Schema.Struct({
	tracks: Schema.Array(QueueAddTrackInputSchema),
	insertNext: Schema.optionalKey(Schema.Boolean),
});
export type ApiQueueAddInput = Schema.Schema.Type<typeof QueueAddInputSchema>;

export const QueueIndexInputSchema = Schema.Struct({
	index: Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
export type ApiQueueIndexInput = Schema.Schema.Type<
	typeof QueueIndexInputSchema
>;
