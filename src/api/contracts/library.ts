import { Schema } from "effect";
import { AlbumPlacementSchema, SourceIdSchema } from "./common.js";

export const LibraryAlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	year: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
	placement: AlbumPlacementSchema,
	placementUpdatedAt: Schema.Number,
	sourceIds: Schema.Array(Schema.String),
});

export const LibraryAlbumTrackSchema = Schema.Struct({
	id: Schema.String,
	trackIndex: Schema.Number,
	title: Schema.String,
	artist: Schema.String,
	duration: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
});

export const LibraryAlbumStateSchema = Schema.Struct({
	sourceId: Schema.String,
	albumId: Schema.optionalKey(Schema.String),
	placement: Schema.optionalKey(AlbumPlacementSchema),
});

export const SaveAlbumResultSchema = Schema.Struct({
	id: Schema.String,
	outcome: Schema.Literals(["created", "existing", "restored"]),
	placement: AlbumPlacementSchema,
});

export const BookmarkTypeSchema = Schema.Literals(["artist", "song"]);
export const SourceRefSchema = SourceIdSchema;
