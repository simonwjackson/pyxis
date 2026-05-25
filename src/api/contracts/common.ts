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

export const OpaqueTrackIdSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(768),
	Schema.makeFilter((value) =>
		/^[A-Za-z0-9_-]+$/.test(value)
			? undefined
			: { path: [], issue: "opaque track id contains unsupported characters" },
	),
);

export const CompositeTrackIdSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(768),
	Schema.makeFilter((value) => {
		const separatorIndex = value.indexOf(":");
		if (separatorIndex === -1) {
			return {
				path: [],
				issue: "composite track id must include a source prefix",
			};
		}

		const source = value.slice(0, separatorIndex);
		const id = value.slice(separatorIndex + 1);
		try {
			Schema.decodeUnknownSync(SourceTypeSchema)(source);
			Schema.decodeUnknownSync(SourceIdPartSchema)(id);
			return undefined;
		} catch {
			return {
				path: [],
				issue:
					"composite track id must use a known source prefix and non-empty id",
			};
		}
	}),
);
export type ApiCompositeTrackId = Schema.Schema.Type<
	typeof CompositeTrackIdSchema
>;

/**
 * RPC-facing track id. Accepts either a source-prefixed composite id
 * (`source:trackId`) or a bare opaque library nanoid. Callers that require a
 * source prefix (album, playlist, stream URL) must enforce that themselves.
 */
export const TrackIdInputSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(768),
	Schema.makeFilter((value) => {
		const idx = value.indexOf(":");
		if (idx === -1) {
			try {
				Schema.decodeUnknownSync(OpaqueTrackIdSchema)(value);
				return undefined;
			} catch {
				return {
					path: [],
					issue: "opaque track id contains unsupported characters",
				};
			}
		}
		try {
			Schema.decodeUnknownSync(CompositeTrackIdSchema)(value);
			return undefined;
		} catch {
			return {
				path: [],
				issue:
					"track id must be a source-prefixed composite id or a bare opaque id",
			};
		}
	}),
);
export type ApiTrackIdInput = Schema.Schema.Type<typeof TrackIdInputSchema>;

/**
 * Public stream URL. Always rooted at `/stream/` so that browsers and the
 * Android bridge cannot be redirected to arbitrary upstreams via wire payloads.
 */
export const StreamUrlSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(2048),
	Schema.makeFilter((value) =>
		value.startsWith("/stream/")
			? undefined
			: { path: [], issue: "stream URL must be served from /stream/" },
	),
);

/**
 * Finite, non-negative progress in seconds. Rejects `NaN`, `Infinity`, and
 * negative reports before the player service is touched.
 */
export const ProgressSchema = Schema.Finite.check(
	Schema.isGreaterThanOrEqualTo(0),
);

/**
 * Finite, non-negative duration in seconds. Same rejection envelope as
 * {@link ProgressSchema}.
 */
export const DurationSchema = Schema.Finite.check(
	Schema.isGreaterThanOrEqualTo(0),
);

/**
 * Volume level. Integer 0..100 inclusive; rejects non-finite values, floats,
 * and out-of-range numbers.
 */
export const VolumeSchema = Schema.Finite.check(
	Schema.isInt(),
	Schema.isBetween({ minimum: 0, maximum: 100 }),
);

/**
 * Stable identifier attached to player progress/duration/ended reports so the
 * service can drop stale reports from a previous track.
 */
export const CommandIdSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(128),
	Schema.makeFilter((value) =>
		/^[A-Za-z0-9_.:-]+$/.test(value)
			? undefined
			: { path: [], issue: "command id contains unsupported characters" },
	),
);

/**
 * Bounded client-log message body. Rejects empty strings and large payloads
 * before the logger runs.
 */
export const ClientLogMessageSchema = Schema.String.check(
	Schema.isMinLength(1),
	Schema.isMaxLength(4096),
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
	StaleCommand: {
		code: Schema.String,
	},
	StaleReport: {
		code: Schema.String,
	},
	Defect: {
		code: Schema.Literal("internal_defect"),
	},
});
export type ApiPublicError = Schema.Schema.Type<typeof PublicErrorSchema>;

export const OkResponseSchema = Schema.Struct({ ok: Schema.Literal(true) });
export type ApiOkResponse = Schema.Schema.Type<typeof OkResponseSchema>;

export const SuccessResponseSchema = Schema.Struct({
	success: Schema.Literal(true),
});
export type ApiSuccessResponse = Schema.Schema.Type<
	typeof SuccessResponseSchema
>;

export const PaginationInputSchema = Schema.Struct({
	limit: Schema.optionalKey(
		Schema.Finite.check(
			Schema.isInt(),
			Schema.isBetween({ minimum: 1, maximum: 200 }),
		),
	),
	offset: Schema.optionalKey(
		Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
	),
});
export type ApiPaginationInput = Schema.Schema.Type<
	typeof PaginationInputSchema
>;
