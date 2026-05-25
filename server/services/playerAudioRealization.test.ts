import { beforeEach, describe, expect, it } from "bun:test";
import { getAudioRealization, play, reportAudioError, reportProgress, stop } from "./player.js";
import type { QueueTrack } from "./queue.js";

function track(): QueueTrack {
	return {
		id: "ytmusic:audio-track",
		title: "Audio Track",
		artist: "Artist",
		album: "Album",
		duration: 120,
		artworkUrl: null,
		source: "ytmusic",
	};
}

describe("player audio realization", () => {
	beforeEach(() => stop());

	it("starts unknown for new playback until the WebView observes audio", () => {
		play([track()], { type: "manual" });

		expect(getAudioRealization().observedAt).toBeNull();
		expect(getAudioRealization().failed).toBe(false);
	});

	it("records progress reports as audio observations", () => {
		play([track()], { type: "manual" });
		reportProgress(5);

		expect(getAudioRealization().observedAt).toBeNumber();
		expect(getAudioRealization().failed).toBe(false);
	});

	it("records audio errors as failed realization", () => {
		play([track()], { type: "manual" });
		reportAudioError("decode failed");

		expect(getAudioRealization().failed).toBe(true);
		expect(getAudioRealization().error).toBe("decode failed");
	});
});
