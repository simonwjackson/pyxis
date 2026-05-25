import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { QueueStateSchema } from "./queue.js";

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
});
