import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
  ClientLogMessageSchema,
  CommandIdSchema,
  CompositeTrackIdSchema,
  DurationSchema,
  OpaqueTrackIdSchema,
  PaginationInputSchema,
  ProgressSchema,
  PublicErrorSchema,
  SourceIdSchema,
  StreamUrlSchema,
  TrackIdInputSchema,
  VolumeSchema,
} from "./common.js";

describe("API common contracts", () => {
  it("accepts known source IDs and composite track IDs", () => {
    expect(
      Schema.decodeUnknownSync(SourceIdSchema)({
        source: "ytmusic",
        id: "album_123",
      }),
    ).toEqual({
      source: "ytmusic",
      id: "album_123",
    });
    expect(
      Schema.decodeUnknownSync(CompositeTrackIdSchema)("ytmusic:track_123"),
    ).toBe("ytmusic:track_123");
    expect(
      Schema.decodeUnknownSync(OpaqueTrackIdSchema)("opaqueLocalId_123"),
    ).toBe("opaqueLocalId_123");
  });

  it("rejects unknown source prefixes before stream or RPC handlers use them", () => {
    expect(() =>
      Schema.decodeUnknownSync(CompositeTrackIdSchema)("evil:track_123"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CompositeTrackIdSchema)("ytmusic:"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CompositeTrackIdSchema)("opaqueLocalId_123"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CompositeTrackIdSchema)("bad opaque id"),
    ).toThrow();
  });

  it("keeps public errors closed and free of raw internal messages", () => {
    const decoded = Schema.decodeUnknownSync(PublicErrorSchema)({
      _tag: "Defect",
      code: "internal_defect",
    });
    expect(decoded).toEqual({ _tag: "Defect", code: "internal_defect" });
    const withRawMessage = Schema.decodeUnknownSync(PublicErrorSchema)({
      _tag: "Defect",
      code: "internal_defect",
      message: "/home/user/secrets leaked",
    });
    expect(withRawMessage).toEqual({ _tag: "Defect", code: "internal_defect" });
  });

  it("models the full public error taxonomy with stable _tag discriminants", () => {
    const cases = [
      { _tag: "ValidationError", code: "schema_invalid" },
      { _tag: "Unauthorized", code: "no_credentials" },
      { _tag: "AuthRefreshFailed", code: "pandora_refresh_failed" },
      { _tag: "NotFound", resource: "album" },
      { _tag: "SourceUnavailable", source: "pandora", code: "no_session" },
      { _tag: "PersistenceError", code: "persistence_write_failed" },
      {
        _tag: "UpstreamProviderError",
        source: "ytmusic",
        code: "provider_500",
      },
      { _tag: "StaleCommand", code: "stale_track" },
      { _tag: "StaleReport", code: "stale_progress" },
      { _tag: "Defect", code: "internal_defect" },
    ];
    for (const value of cases) {
      expect(Schema.decodeUnknownSync(PublicErrorSchema)(value)).toMatchObject({
        _tag: value._tag,
      });
    }
  });

  it("rejects unrecognized public error tags", () => {
    expect(() =>
      Schema.decodeUnknownSync(PublicErrorSchema)({
        _tag: "SomethingElse",
        code: "x",
      }),
    ).toThrow();
  });

  it("accepts both composite and bare opaque track id inputs", () => {
    expect(
      Schema.decodeUnknownSync(TrackIdInputSchema)("ytmusic:track_123"),
    ).toBe("ytmusic:track_123");
    expect(Schema.decodeUnknownSync(TrackIdInputSchema)("nanoidLike01")).toBe(
      "nanoidLike01",
    );
  });

  it("rejects malformed track id input", () => {
    expect(() => Schema.decodeUnknownSync(TrackIdInputSchema)("")).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(TrackIdInputSchema)("bad opaque id"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(TrackIdInputSchema)("ytmusic:"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(TrackIdInputSchema)("evil:track_123"),
    ).toThrow();
  });

  it("rejects stream URLs that are not served from /stream/", () => {
    expect(Schema.decodeUnknownSync(StreamUrlSchema)("/stream/ytmusic:t")).toBe(
      "/stream/ytmusic:t",
    );
    expect(() =>
      Schema.decodeUnknownSync(StreamUrlSchema)("https://example.test/audio"),
    ).toThrow();
    expect(() => Schema.decodeUnknownSync(StreamUrlSchema)("/")).toThrow();
  });

  it("rejects non-finite progress, duration, and volume", () => {
    expect(Schema.decodeUnknownSync(ProgressSchema)(0)).toBe(0);
    expect(Schema.decodeUnknownSync(DurationSchema)(180.5)).toBe(180.5);
    expect(Schema.decodeUnknownSync(VolumeSchema)(50)).toBe(50);

    expect(() =>
      Schema.decodeUnknownSync(ProgressSchema)(Number.POSITIVE_INFINITY),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProgressSchema)(Number.NaN),
    ).toThrow();
    expect(() => Schema.decodeUnknownSync(ProgressSchema)(-1)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(DurationSchema)(Number.POSITIVE_INFINITY),
    ).toThrow();
    expect(() => Schema.decodeUnknownSync(DurationSchema)(-0.0001)).toThrow();
    expect(() => Schema.decodeUnknownSync(VolumeSchema)(101)).toThrow();
    expect(() => Schema.decodeUnknownSync(VolumeSchema)(-1)).toThrow();
    expect(() => Schema.decodeUnknownSync(VolumeSchema)(50.5)).toThrow();
    expect(() => Schema.decodeUnknownSync(VolumeSchema)(Number.NaN)).toThrow();
  });

  it("accepts pagination input within bounds and rejects out-of-range or non-integer values", () => {
    expect(
      Schema.decodeUnknownSync(PaginationInputSchema)({ limit: 50, offset: 0 }),
    ).toEqual({ limit: 50, offset: 0 });
    expect(Schema.decodeUnknownSync(PaginationInputSchema)({})).toEqual({});

    expect(() =>
      Schema.decodeUnknownSync(PaginationInputSchema)({ limit: 0 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PaginationInputSchema)({ limit: 201 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PaginationInputSchema)({ limit: 1.5 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PaginationInputSchema)({ offset: -1 }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PaginationInputSchema)({
        offset: Number.POSITIVE_INFINITY,
      }),
    ).toThrow();
  });

  it("bounds command identifiers and client log payloads", () => {
    expect(Schema.decodeUnknownSync(CommandIdSchema)("cmd_123-abc")).toBe(
      "cmd_123-abc",
    );
    expect(() => Schema.decodeUnknownSync(CommandIdSchema)("")).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CommandIdSchema)("invalid space"),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CommandIdSchema)("x".repeat(129)),
    ).toThrow();

    expect(Schema.decodeUnknownSync(ClientLogMessageSchema)("hi")).toBe("hi");
    expect(() =>
      Schema.decodeUnknownSync(ClientLogMessageSchema)(""),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ClientLogMessageSchema)("x".repeat(4097)),
    ).toThrow();
  });
});
