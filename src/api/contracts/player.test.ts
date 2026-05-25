import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { PlayerStateSchema } from "./player.js";

describe("player API contracts", () => {
	it("preserves null current track for stopped playback", () => {
		const state = Schema.decodeUnknownSync(PlayerStateSchema)({
			status: "stopped",
			currentTrack: null,
			progress: 0,
			duration: 0,
			volume: 100,
			updatedAt: 1,
		});

		expect(state.currentTrack).toBeNull();
	});

	it("rejects out-of-range playback state before it reaches clients", () => {
		expect(() =>
			Schema.decodeUnknownSync(PlayerStateSchema)({
				status: "playing",
				currentTrack: null,
				progress: -1,
				duration: 0,
				volume: 101,
				updatedAt: 1,
			}),
		).toThrow();
	});
});
