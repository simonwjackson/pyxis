import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { AndroidMediaBridgeStateSchema } from "./androidMediaBridge.js";

const validState = {
	status: "playing",
	availability: "controllable",
	currentTrack: {
		id: "ytmusic:track-1",
		title: "Track",
		artist: "Artist",
		album: "Album",
		duration: 120,
		artworkUrl: null,
	},
	progress: 5,
	duration: 120,
	stateRevision: 1,
	stateUpdatedAt: 1000,
	publishedAt: 1001,
	audioObservedAt: 1001,
	availableActions: ["pause", "next"],
};

describe("AndroidMediaBridgeStateSchema", () => {
	it("accepts display metadata without stream URLs", () => {
		const state = Schema.decodeUnknownSync(AndroidMediaBridgeStateSchema)(validState);

		expect(state.currentTrack?.title).toBe("Track");
		expect("streamUrl" in (state.currentTrack ?? {})).toBe(false);
	});

	it("rejects invalid status and action literals", () => {
		expect(() =>
			Schema.decodeUnknownSync(AndroidMediaBridgeStateSchema)({
				...validState,
				status: "buffering",
				availableActions: ["launch-settings"],
			}),
		).toThrow();
	});

	it("rejects negative progress, duration, and revision", () => {
		expect(() =>
			Schema.decodeUnknownSync(AndroidMediaBridgeStateSchema)({
				...validState,
				progress: -1,
				duration: -1,
				stateRevision: -1,
			}),
		).toThrow();
	});
});
