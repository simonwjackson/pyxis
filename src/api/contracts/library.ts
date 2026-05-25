import { Schema } from "effect";
import {
	AlbumPlacementSchema,
	SourceIdSchema,
	TrackIdInputSchema,
} from "./common.js";

export const LibraryAlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	year: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
	placement: AlbumPlacementSchema,
	placementUpdatedAt: Schema.Number,
	sourceIds: Schema.Array(Schema.String),
	/**
	 * Hot-shelf signal computed by the server from recent listen activity.
	 * Always present on library album wire payloads so the home/hot shelves,
	 * search badge, and album detail header render the same indicator the
	 * legacy tRPC handlers emitted.
	 */
	isHot: Schema.Boolean,
	/**
	 * Hot-shelf rank, `null` when {@link isHot} is `false`. Smaller numbers
	 * sort earlier on the hot shelf.
	 */
	hotRank: Schema.Union([Schema.Number, Schema.Null]),
});
export type ApiLibraryAlbum = Schema.Schema.Type<typeof LibraryAlbumSchema>;

export const LibraryAlbumListSchema = Schema.Array(LibraryAlbumSchema);
export type ApiLibraryAlbumList = Schema.Schema.Type<
	typeof LibraryAlbumListSchema
>;

const TrackCapabilitiesSchema = Schema.Struct({
	feedback: Schema.Boolean,
	sleep: Schema.Boolean,
	bookmark: Schema.Boolean,
	explain: Schema.Boolean,
	radio: Schema.Boolean,
});

export const LibraryAlbumTrackSchema = Schema.Struct({
	id: Schema.String,
	trackIndex: Schema.Number,
	title: Schema.String,
	artist: Schema.String,
	duration: Schema.optionalKey(Schema.Number),
	artworkUrl: Schema.optionalKey(Schema.String),
	capabilities: TrackCapabilitiesSchema,
});
export type ApiLibraryAlbumTrack = Schema.Schema.Type<
	typeof LibraryAlbumTrackSchema
>;

export const LibraryAlbumTrackListSchema = Schema.Array(
	LibraryAlbumTrackSchema,
);

export const LibraryAlbumStateSchema = Schema.Struct({
	sourceId: Schema.String,
	albumId: Schema.optionalKey(Schema.String),
	placement: Schema.optionalKey(AlbumPlacementSchema),
});
export type ApiLibraryAlbumState = Schema.Schema.Type<
	typeof LibraryAlbumStateSchema
>;

export const LibraryAlbumStateListSchema = Schema.Array(
	LibraryAlbumStateSchema,
);

export const SaveAlbumResultSchema = Schema.Struct({
	id: Schema.String,
	outcome: Schema.Literals(["created", "existing", "restored"]),
	placement: AlbumPlacementSchema,
});
export type ApiSaveAlbumResult = Schema.Schema.Type<
	typeof SaveAlbumResultSchema
>;

export const BookmarkTypeSchema = Schema.Literals(["artist", "song"]);
export type ApiBookmarkType = Schema.Schema.Type<typeof BookmarkTypeSchema>;

export const SourceRefSchema = SourceIdSchema;

// --- Input contracts ------------------------------------------------------

export const ListLibraryAlbumsInputSchema = Schema.Struct({
	placements: Schema.optionalKey(Schema.Array(AlbumPlacementSchema)),
	includeArchive: Schema.optionalKey(Schema.Boolean),
	includeDismissed: Schema.optionalKey(Schema.Boolean),
	hotOnly: Schema.optionalKey(Schema.Boolean),
});
export type ApiListLibraryAlbumsInput = Schema.Schema.Type<
	typeof ListLibraryAlbumsInputSchema
>;

export const LibraryAlbumIdInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiLibraryAlbumIdInput = Schema.Schema.Type<
	typeof LibraryAlbumIdInputSchema
>;

export const HotAlbumsInputSchema = Schema.Struct({
	includeDismissed: Schema.optionalKey(Schema.Boolean),
	limit: Schema.optionalKey(
		Schema.Finite.check(
			Schema.isInt(),
			Schema.isBetween({ minimum: 1, maximum: 100 }),
		),
	),
});
export type ApiHotAlbumsInput = Schema.Schema.Type<typeof HotAlbumsInputSchema>;

export const ResolveAlbumStatesInputSchema = Schema.Struct({
	sourceIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
});
export type ApiResolveAlbumStatesInput = Schema.Schema.Type<
	typeof ResolveAlbumStatesInputSchema
>;

export const LibraryAlbumTracksInputSchema = Schema.Struct({
	albumId: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiLibraryAlbumTracksInput = Schema.Schema.Type<
	typeof LibraryAlbumTracksInputSchema
>;

/**
 * Save album requires a source-prefixed composite id so the source manager
 * can find the upstream album. Bare nanoids are rejected at the contract
 * boundary instead of throwing inside the handler.
 */
export const SaveAlbumInputSchema = Schema.Struct({
	id: Schema.String.check(
		Schema.isMinLength(3),
		Schema.makeFilter((value) =>
			value.includes(":")
				? undefined
				: {
						path: [],
						issue: "save album requires a source-prefixed composite id",
					},
		),
	),
});
export type ApiSaveAlbumInput = Schema.Schema.Type<typeof SaveAlbumInputSchema>;

export const SetAlbumPlacementInputSchema = Schema.Struct({
	albumId: Schema.String.check(Schema.isMinLength(1)),
	placement: AlbumPlacementSchema,
});
export type ApiSetAlbumPlacementInput = Schema.Schema.Type<
	typeof SetAlbumPlacementInputSchema
>;

export const RemoveLibraryAlbumInputSchema = LibraryAlbumIdInputSchema;
export type ApiRemoveLibraryAlbumInput = Schema.Schema.Type<
	typeof RemoveLibraryAlbumInputSchema
>;

const NonEmptyTrimmedStringSchema = Schema.String.check(
	Schema.makeFilter((value) =>
		value.trim().length > 0
			? undefined
			: { path: [], issue: "must be a non-empty trimmed string" },
	),
);

export const UpdateAlbumInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
	title: Schema.optionalKey(NonEmptyTrimmedStringSchema),
	artist: Schema.optionalKey(NonEmptyTrimmedStringSchema),
}).check(
	Schema.makeFilter((value) =>
		value.title !== undefined || value.artist !== undefined
			? undefined
			: {
					path: [],
					issue: "update album requires at least one of title or artist",
				},
	),
);
export type ApiUpdateAlbumInput = Schema.Schema.Type<
	typeof UpdateAlbumInputSchema
>;

export const UpdateLibraryTrackInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
	title: NonEmptyTrimmedStringSchema,
});
export type ApiUpdateLibraryTrackInput = Schema.Schema.Type<
	typeof UpdateLibraryTrackInputSchema
>;

export const AddBookmarkInputSchema = Schema.Struct({
	id: TrackIdInputSchema,
	type: BookmarkTypeSchema,
});
export type ApiAddBookmarkInput = Schema.Schema.Type<
	typeof AddBookmarkInputSchema
>;

export const RemoveBookmarkInputSchema = Schema.Struct({
	bookmarkToken: Schema.String.check(Schema.isMinLength(1)),
	type: BookmarkTypeSchema,
});
export type ApiRemoveBookmarkInput = Schema.Schema.Type<
	typeof RemoveBookmarkInputSchema
>;

/**
 * Pandora bookmark response. Bind only the fields rendered by the UI;
 * additional upstream metadata is dropped at the wire boundary.
 */
export const PandoraBookmarkSchema = Schema.Struct({
	bookmarkToken: Schema.String,
	musicToken: Schema.optionalKey(Schema.String),
	artistName: Schema.optionalKey(Schema.String),
	songName: Schema.optionalKey(Schema.String),
	albumName: Schema.optionalKey(Schema.String),
	artUrl: Schema.optionalKey(Schema.String),
	dateCreated: Schema.optionalKey(Schema.Struct({ time: Schema.Number })),
});
export type ApiPandoraBookmark = Schema.Schema.Type<
	typeof PandoraBookmarkSchema
>;

export const BookmarksResponseSchema = Schema.Struct({
	artists: Schema.optionalKey(Schema.Array(PandoraBookmarkSchema)),
	songs: Schema.optionalKey(Schema.Array(PandoraBookmarkSchema)),
});
export type ApiBookmarksResponse = Schema.Schema.Type<
	typeof BookmarksResponseSchema
>;
