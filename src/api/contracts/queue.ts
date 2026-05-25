import { Schema } from "effect";
import { CompositeTrackIdSchema } from "./common.js";

export const QueueTrackSchema = Schema.Struct({
	id: CompositeTrackIdSchema,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.Union([Schema.Number, Schema.Null]),
	artworkUrl: Schema.Union([Schema.String, Schema.Null]),
});

export const QueueContextSchema = Schema.Union([
	Schema.Struct({ type: Schema.Literal("manual") }),
	Schema.Struct({ type: Schema.Literal("radio"), seedId: Schema.String }),
	Schema.Struct({ type: Schema.Literal("album"), albumId: Schema.String }),
	Schema.Struct({
		type: Schema.Literal("playlist"),
		playlistId: Schema.String,
	}),
]);

export const QueueStateSchema = Schema.Struct({
	items: Schema.Array(QueueTrackSchema),
	currentIndex: Schema.Number.check(
		Schema.isInt(),
		Schema.isGreaterThanOrEqualTo(0),
	),
	context: QueueContextSchema,
});
