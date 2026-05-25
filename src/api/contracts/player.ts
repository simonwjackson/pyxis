import { Schema } from "effect";
import { CompositeTrackIdSchema, StreamUrlSchema } from "./common.js";

export const PlayerStatusSchema = Schema.Literals(["playing", "paused", "stopped"]);

export const PlayerTrackSchema = Schema.Struct({
	id: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
	streamUrl: StreamUrlSchema,
});

export const PlayerStateSchema = Schema.Struct({
	status: PlayerStatusSchema,
	currentTrack: Schema.Union([PlayerTrackSchema, Schema.Null]),
	progress: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
	duration: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
	volume: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
	updatedAt: Schema.Number,
});
