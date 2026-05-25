import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	CompositeTrackIdSchema,
	OpaqueTrackIdSchema,
	PublicErrorSchema,
	SourceIdSchema,
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
});
