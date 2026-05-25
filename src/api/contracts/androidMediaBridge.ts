import { Schema } from "effect";
import { CompositeTrackIdSchema } from "./common.js";

export const AndroidMediaBridgePlaybackStatusSchema = Schema.Literals([
	"playing",
	"paused",
	"stopped",
	"unavailable",
	"defect",
]);

export const AndroidMediaBridgeAvailabilitySchema = Schema.Literals([
	"controllable",
	"stale",
	"audio_unknown",
	"audio_failed",
	"unavailable",
	"defect",
]);

export const AndroidMediaBridgeActionSchema = Schema.Literals([
	"play",
	"pause",
	"next",
	"previous",
]);

export const AndroidMediaBridgeCommandOutcomeSchema = Schema.Literals([
	"applied",
	"rejected",
	"noop",
	"unavailable",
	"stale_state",
]);

export const AndroidMediaBridgeTrackSchema = Schema.Struct({
	id: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)), Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
});

export const AndroidMediaBridgeStateSchema = Schema.Struct({
	status: AndroidMediaBridgePlaybackStatusSchema,
	availability: AndroidMediaBridgeAvailabilitySchema,
	currentTrack: Schema.Union([AndroidMediaBridgeTrackSchema, Schema.Null]),
	progress: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
	duration: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
	stateRevision: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
	stateUpdatedAt: Schema.Number,
	publishedAt: Schema.Number,
	audioObservedAt: Schema.Union([Schema.Number, Schema.Null]),
	availableActions: Schema.Array(AndroidMediaBridgeActionSchema),
});

export const AndroidMediaBridgeCommandResultSchema = Schema.Struct({
	outcome: AndroidMediaBridgeCommandOutcomeSchema,
	state: AndroidMediaBridgeStateSchema,
	correlationId: Schema.String,
});

export type AndroidMediaBridgeState = typeof AndroidMediaBridgeStateSchema.Type;
export type AndroidMediaBridgeCommandResult = typeof AndroidMediaBridgeCommandResultSchema.Type;
