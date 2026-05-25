import { Schema } from "effect";

const TrackCapabilitiesSchema = Schema.Struct({
	feedback: Schema.Boolean,
	sleep: Schema.Boolean,
	bookmark: Schema.Boolean,
	explain: Schema.Boolean,
	radio: Schema.Boolean,
});

export const RadioIdInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiRadioIdInput = Schema.Schema.Type<typeof RadioIdInputSchema>;

/**
 * Loose station summary kept for legacy callers; the active station list
 * surface is {@link StationSummarySchema} with the full quick-mix metadata.
 */
export const StationSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	artworkUrl: Schema.optionalKey(Schema.String),
});
export const StationListSchema = Schema.Array(StationSchema);

export const StationSummarySchema = Schema.Struct({
	id: Schema.String,
	stationId: Schema.String,
	name: Schema.String,
	isQuickMix: Schema.Boolean,
	quickMixStationIds: Schema.Array(Schema.String),
	allowDelete: Schema.Boolean,
	allowRename: Schema.Boolean,
});
export type ApiStationSummary = Schema.Schema.Type<typeof StationSummarySchema>;

export const StationSummaryListSchema = Schema.Array(StationSummarySchema);

export const StationSeedSchema = Schema.Struct({
	seedId: Schema.String,
	artistName: Schema.optionalKey(Schema.String),
	songName: Schema.optionalKey(Schema.String),
	musicToken: Schema.String,
});
export type ApiStationSeed = Schema.Schema.Type<typeof StationSeedSchema>;

export const StationFeedbackEntrySchema = Schema.Struct({
	feedbackId: Schema.String,
	songName: Schema.String,
	artistName: Schema.String,
	isPositive: Schema.Boolean,
	dateCreated: Schema.Struct({ time: Schema.Number }),
});
export type ApiStationFeedbackEntry = Schema.Schema.Type<
	typeof StationFeedbackEntrySchema
>;

export const StationDetailSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	stationId: Schema.String,
	music: Schema.optionalKey(
		Schema.Struct({
			artists: Schema.Array(StationSeedSchema),
			songs: Schema.Array(StationSeedSchema),
		}),
	),
	feedback: Schema.optionalKey(
		Schema.Struct({
			thumbsUp: Schema.Array(StationFeedbackEntrySchema),
			thumbsDown: Schema.Array(StationFeedbackEntrySchema),
		}),
	),
});
export type ApiStationDetail = Schema.Schema.Type<typeof StationDetailSchema>;

export const RadioQualitySchema = Schema.Literals(["high", "medium", "low"]);
export type ApiRadioQuality = Schema.Schema.Type<typeof RadioQualitySchema>;

export const GetRadioTracksInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
	quality: Schema.optionalKey(RadioQualitySchema),
});
export type ApiGetRadioTracksInput = Schema.Schema.Type<
	typeof GetRadioTracksInputSchema
>;

/**
 * Encoded Pandora radio track. `artworkUrl` is explicit `null` when upstream
 * omits it, preserving the current wire semantics consumers rely on.
 */
export const RadioTrackSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
	capabilities: TrackCapabilitiesSchema,
});
export type ApiRadioTrack = Schema.Schema.Type<typeof RadioTrackSchema>;

export const RadioTrackListSchema = Schema.Array(RadioTrackSchema);

/**
 * `radio.create` accepts opaque seed/token combinations chosen by the UI for
 * different creation surfaces. At least one of `musicToken`, `trackToken`, or
 * `seedId` must be present.
 */
export const CreateStationInputSchema = Schema.Struct({
	seedId: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
	musicToken: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
	trackToken: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
	musicType: Schema.optionalKey(Schema.Literals(["song", "artist"])),
}).check(
	Schema.makeFilter((value) =>
		value.seedId !== undefined ||
		value.musicToken !== undefined ||
		value.trackToken !== undefined
			? undefined
			: {
					path: [],
					issue:
						"create station requires at least one of seedId, musicToken, or trackToken",
				},
	),
);
export type ApiCreateStationInput = Schema.Schema.Type<
	typeof CreateStationInputSchema
>;

export const DeleteStationInputSchema = RadioIdInputSchema;
export type ApiDeleteStationInput = Schema.Schema.Type<
	typeof DeleteStationInputSchema
>;

export const RenameStationInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
});
export type ApiRenameStationInput = Schema.Schema.Type<
	typeof RenameStationInputSchema
>;

export const QuickMixInputSchema = Schema.Struct({
	radioIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
});
export type ApiQuickMixInput = Schema.Schema.Type<typeof QuickMixInputSchema>;

export const AddRadioSeedInputSchema = Schema.Struct({
	radioId: Schema.String.check(Schema.isMinLength(1)),
	musicToken: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiAddRadioSeedInput = Schema.Schema.Type<
	typeof AddRadioSeedInputSchema
>;

export const RemoveRadioSeedInputSchema = Schema.Struct({
	radioId: Schema.String.check(Schema.isMinLength(1)),
	seedId: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiRemoveRadioSeedInput = Schema.Schema.Type<
	typeof RemoveRadioSeedInputSchema
>;

/**
 * Pandora genre station category. Upstream payload has nested category
 * groupings; pin the fields the UI renders.
 */
export const GenreCategorySchema = Schema.Struct({
	categoryName: Schema.String,
	stations: Schema.Array(
		Schema.Struct({
			stationToken: Schema.String,
			stationName: Schema.String,
		}),
	),
});
export type ApiGenreCategory = Schema.Schema.Type<typeof GenreCategorySchema>;

export const GenreCategoryListSchema = Schema.Array(GenreCategorySchema);
