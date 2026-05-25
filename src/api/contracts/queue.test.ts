import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	QueueAddInputSchema,
	QueueContextSchema,
	QueueIndexInputSchema,
	QueueStateSchema,
} from "./queue.js";

describe("queue API contracts", () => {
	it("decodes the current queue router state with a required discriminated context", () => {
		const decoded = Schema.decodeUnknownSync(QueueStateSchema)({
			items: [
				{
					id: "ytmusic:track_1",
					title: "Track",
					artist: "Artist",
					album: "Album",
					duration: null,
					artworkUrl: null,
				},
			],
			currentIndex: 0,
			context: { type: "radio", seedId: "pandora:seed_1" },
		});

		expect(decoded.context).toEqual({
			type: "radio",
			seedId: "pandora:seed_1",
		});
	});

	it("rejects stale optional string context shapes", () => {
		expect(() =>
			Schema.decodeUnknownSync(QueueStateSchema)({
				items: [],
				currentIndex: 0,
				context: "manual",
			}),
		).toThrow();
	});

	it("rejects negative or non-integer currentIndex", () => {
		expect(() =>
			Schema.decodeUnknownSync(QueueStateSchema)({
				items: [],
				currentIndex: -1,
				context: { type: "manual" },
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(QueueStateSchema)({
				items: [],
				currentIndex: 1.5,
				context: { type: "manual" },
			}),
		).toThrow();
	});

	it("rejects queue context with empty discriminator payloads", () => {
		expect(
			Schema.decodeUnknownSync(QueueContextSchema)({ type: "manual" }),
		).toMatchObject({ type: "manual" });
		expect(() =>
			Schema.decodeUnknownSync(QueueContextSchema)({
				type: "radio",
				seedId: "",
			}),
		).toThrow();
	});

	it("accepts queue add input with bounded track ids", () => {
		expect(
			Schema.decodeUnknownSync(QueueAddInputSchema)({
				tracks: [
					{
						id: "ytmusic:track_1",
						title: "Track",
						artist: "Artist",
						album: "Album",
						duration: null,
						artworkUrl: null,
					},
				],
				insertNext: true,
			}),
		).toMatchObject({ insertNext: true });
		expect(() =>
			Schema.decodeUnknownSync(QueueAddInputSchema)({
				tracks: [
					{
						id: "evil:bad",
						title: "Track",
						artist: "Artist",
						album: "Album",
						duration: null,
						artworkUrl: null,
					},
				],
			}),
		).toThrow();
	});

	it("rejects negative or non-integer queue indices", () => {
		expect(
			Schema.decodeUnknownSync(QueueIndexInputSchema)({ index: 0 }),
		).toEqual({ index: 0 });
		expect(() =>
			Schema.decodeUnknownSync(QueueIndexInputSchema)({ index: -1 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(QueueIndexInputSchema)({ index: 0.5 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(QueueIndexInputSchema)({
				index: Number.POSITIVE_INFINITY,
			}),
		).toThrow();
	});
});
