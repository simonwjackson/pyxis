import { Schema } from "effect";

export const ArtistIdInputSchema = Schema.Struct({
	id: Schema.String.check(Schema.isMinLength(1)),
});
export type ApiArtistIdInput = Schema.Schema.Type<typeof ArtistIdInputSchema>;

export const ArtistSearchInputSchema = Schema.Struct({
	query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});
export type ApiArtistSearchInput = Schema.Schema.Type<
	typeof ArtistSearchInputSchema
>;

export const ArtistSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	source: Schema.optionalKey(Schema.String),
});
export type ApiArtist = Schema.Schema.Type<typeof ArtistSchema>;

export const ArtistSearchResponseSchema = Schema.Struct({
	artists: Schema.Array(
		Schema.Struct({ id: Schema.String, name: Schema.String }),
	),
});
export type ApiArtistSearchResponse = Schema.Schema.Type<
	typeof ArtistSearchResponseSchema
>;
