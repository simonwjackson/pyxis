import { Schema } from "effect";

export const SourceTypeSchema = Schema.Literals([
	"pandora",
	"ytmusic",
	"youtube",
	"local",
	"musicbrainz",
	"discogs",
	"deezer",
	"bandcamp",
	"soundcloud",
	"soulseek",
]);
export type ApiSourceType = Schema.Schema.Type<typeof SourceTypeSchema>;

export const AlbumPlacementSchema = Schema.Literals([
	"discovery",
	"collection",
	"archive",
	"dismissed",
]);
export type ApiAlbumPlacement = Schema.Schema.Type<typeof AlbumPlacementSchema>;

const SourceIdPartSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(512),
	Schema.makeFilter((value) =>
		/^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value)
			? undefined
			: { path: [], issue: "source id contains unsupported characters" },
	),
);

export const SourceIdSchema = Schema.Struct({
	source: SourceTypeSchema,
	id: SourceIdPartSchema,
});
export type ApiSourceId = Schema.Schema.Type<typeof SourceIdSchema>;

export const CompositeTrackIdSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(768),
	Schema.makeFilter((value) => {
		const separatorIndex = value.indexOf(":");
		if (separatorIndex === -1) {
			return /^[A-Za-z0-9_-]+$/.test(value)
				? undefined
				: { path: [], issue: "opaque track id contains unsupported characters" };
		}

		const source = value.slice(0, separatorIndex);
		const id = value.slice(separatorIndex + 1);
		try {
			Schema.decodeUnknownSync(SourceTypeSchema)(source);
			Schema.decodeUnknownSync(SourceIdPartSchema)(id);
			return undefined;
		} catch {
			return { path: [], issue: "composite track id must use a known source prefix and non-empty id" };
		}
	}),
);
export type ApiCompositeTrackId = Schema.Schema.Type<typeof CompositeTrackIdSchema>;

export const StreamUrlSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(2048),
);

export const PublicErrorSchema = Schema.TaggedUnion({
	ValidationError: {
		field: Schema.optionalKey(Schema.String),
		code: Schema.String,
	},
	Unauthorized: {
		code: Schema.String,
	},
	AuthRefreshFailed: {
		code: Schema.String,
	},
	NotFound: {
		resource: Schema.String,
	},
	SourceUnavailable: {
		source: Schema.optionalKey(SourceTypeSchema),
		code: Schema.String,
	},
	PersistenceError: {
		code: Schema.String,
	},
	UpstreamProviderError: {
		source: SourceTypeSchema,
		code: Schema.optionalKey(Schema.String),
	},
	Defect: {
		code: Schema.Literal("internal_defect"),
	},
});
export type ApiPublicError = Schema.Schema.Type<typeof PublicErrorSchema>;

export const OkResponseSchema = Schema.Struct({ ok: Schema.Literal(true) });
export const PaginationInputSchema = Schema.Struct({
	limit: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 200 }))),
	offset: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
});
