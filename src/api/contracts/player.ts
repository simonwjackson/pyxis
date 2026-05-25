import { Schema } from "effect";
import {
	CommandIdSchema,
	CompositeTrackIdSchema,
	DurationSchema,
	ProgressSchema,
	StreamUrlSchema,
	TrackIdInputSchema,
	VolumeSchema,
} from "./common.js";

export const PlayerStatusSchema = Schema.Literals([
	"playing",
	"paused",
	"stopped",
]);
export type ApiPlayerStatus = Schema.Schema.Type<typeof PlayerStatusSchema>;

/**
 * Track payload embedded in player state. `duration` and `artworkUrl` are
 * `null` when unknown — kept as explicit `null` instead of absent so the
 * existing UI selectors do not change shape.
 */
export const PlayerTrackSchema = Schema.Struct({
	id: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
	streamUrl: StreamUrlSchema,
});
export type ApiPlayerTrack = Schema.Schema.Type<typeof PlayerTrackSchema>;

export const PlayerStateSchema = Schema.Struct({
	status: PlayerStatusSchema,
	currentTrack: Schema.Union([PlayerTrackSchema, Schema.Null]),
	progress: ProgressSchema,
	duration: DurationSchema,
	volume: VolumeSchema,
	updatedAt: Schema.Number,
});
export type ApiPlayerState = Schema.Schema.Type<typeof PlayerStateSchema>;

// --- Inputs ---------------------------------------------------------------

export const PlayTrackInputSchema = Schema.Struct({
	id: TrackIdInputSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
});
export type ApiPlayTrackInput = Schema.Schema.Type<typeof PlayTrackInputSchema>;

export const PlayContextInputSchema = Schema.Union([
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
export type ApiPlayContextInput = Schema.Schema.Type<
	typeof PlayContextInputSchema
>;

export const PlayInputSchema = Schema.Struct({
	tracks: Schema.optionalKey(Schema.Array(PlayTrackInputSchema)),
	context: Schema.optionalKey(PlayContextInputSchema),
	startIndex: Schema.optionalKey(
		Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
	),
});
export type ApiPlayInput = Schema.Schema.Type<typeof PlayInputSchema>;

export const JumpToIndexInputSchema = Schema.Struct({
	index: Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});
export type ApiJumpToIndexInput = Schema.Schema.Type<
	typeof JumpToIndexInputSchema
>;

export const SeekInputSchema = Schema.Struct({
	position: ProgressSchema,
});
export type ApiSeekInput = Schema.Schema.Type<typeof SeekInputSchema>;

export const VolumeInputSchema = Schema.Struct({ level: VolumeSchema });
export type ApiVolumeInput = Schema.Schema.Type<typeof VolumeInputSchema>;

/**
 * Player progress/duration/ended reports carry an optional
 * `appliesToTrackId` so the service can drop stale reports from a previous
 * track when the queue advances between client and server.
 */
export const ReportProgressInputSchema = Schema.Struct({
	progress: ProgressSchema,
	appliesToTrackId: Schema.optionalKey(CompositeTrackIdSchema),
	commandId: Schema.optionalKey(CommandIdSchema),
});
export type ApiReportProgressInput = Schema.Schema.Type<
	typeof ReportProgressInputSchema
>;

export const ReportDurationInputSchema = Schema.Struct({
	duration: DurationSchema,
	appliesToTrackId: Schema.optionalKey(CompositeTrackIdSchema),
	commandId: Schema.optionalKey(CommandIdSchema),
});
export type ApiReportDurationInput = Schema.Schema.Type<
	typeof ReportDurationInputSchema
>;

export const ReportAudioErrorInputSchema = Schema.Struct({
	message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
	appliesToTrackId: Schema.optionalKey(CompositeTrackIdSchema),
});
export type ApiReportAudioErrorInput = Schema.Schema.Type<
	typeof ReportAudioErrorInputSchema
>;

export const TrackEndedInputSchema = Schema.Struct({
	appliesToTrackId: Schema.optionalKey(CompositeTrackIdSchema),
	commandId: Schema.optionalKey(CommandIdSchema),
});
export type ApiTrackEndedInput = Schema.Schema.Type<
	typeof TrackEndedInputSchema
>;
