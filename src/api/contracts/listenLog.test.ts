import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	ListenLogEntrySchema,
	ListenLogInputSchema,
	ListenLogResponseSchema,
} from "./listenLog.js";

describe("listen log API contracts", () => {
	it("accepts pagination input within bounds", () => {
		expect(
			Schema.decodeUnknownSync(ListenLogInputSchema)({
				limit: 50,
				offset: 0,
			}),
		).toEqual({ limit: 50, offset: 0 });
		expect(Schema.decodeUnknownSync(ListenLogInputSchema)({})).toEqual({});
	});

	it("rejects out-of-range pagination input", () => {
		expect(() =>
			Schema.decodeUnknownSync(ListenLogInputSchema)({ limit: 201 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(ListenLogInputSchema)({ offset: -1 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(ListenLogInputSchema)({
				offset: Number.POSITIVE_INFINITY,
			}),
		).toThrow();
	});

	it("decodes listen log entries with composite track ids", () => {
		const entry = Schema.decodeUnknownSync(ListenLogEntrySchema)({
			id: "log_1",
			compositeId: "ytmusic:track_1",
			title: "Track",
			artist: "Artist",
			album: "Album",
			source: "ytmusic",
			listenedAt: 1700000000,
		});
		expect(entry.compositeId).toBe("ytmusic:track_1");
		expect(entry.album).toBe("Album");
	});

	it("rejects malformed composite ids in listen log entries", () => {
		expect(() =>
			Schema.decodeUnknownSync(ListenLogEntrySchema)({
				id: "log_1",
				compositeId: "evil:track_1",
				title: "Track",
				artist: "Artist",
				source: "ytmusic",
				listenedAt: 1700000000,
			}),
		).toThrow();
	});

	it("decodes empty listen log response", () => {
		expect(Schema.decodeUnknownSync(ListenLogResponseSchema)([])).toEqual([]);
	});
});
