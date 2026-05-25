import { describe, expect, it } from "bun:test";
import { toAndroidMediaBridgeState } from "./androidMediaBridgeState.js";
import type { PlayerStateView } from "./playerStateView.js";

const view: PlayerStateView = {
	status: "playing",
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
	updatedAt: 1000,
};

describe("toAndroidMediaBridgeState", () => {
	it("projects controllable playing state when audio has been observed", () => {
		const state = toAndroidMediaBridgeState(view, {
			publishedAt: 1001,
			stateRevision: 1,
			audio: { observedAt: 1001, failed: false },
		});

		expect(state.availability).toBe("controllable");
		expect(state.availableActions).toContain("pause");
		expect(state.availableActions).toContain("next");
	});

	it("retains metadata but disables actions when audio is unknown", () => {
		const state = toAndroidMediaBridgeState(view, {
			publishedAt: 1001,
			stateRevision: 1,
			audio: { observedAt: null, failed: false },
		});

		expect(state.availability).toBe("audio_unknown");
		expect(state.currentTrack?.title).toBe("Track");
		expect(state.availableActions).toEqual([]);
	});

	it("clears actions for stopped state", () => {
		const state = toAndroidMediaBridgeState(
			{ ...view, status: "stopped", currentTrack: null, progress: 0, duration: 0 },
			{
				publishedAt: 1001,
				stateRevision: 1,
				audio: { observedAt: null, failed: false },
			},
		);

		expect(state.status).toBe("stopped");
		expect(state.currentTrack).toBeNull();
		expect(state.availableActions).toEqual([]);
	});
});
