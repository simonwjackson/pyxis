/**
 * @module player tests
 * Tests for playback state management.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
	getState,
	play,
	pause,
	resume,
	stop,
	skip,
	previousTrack,
	jumpToIndex,
	seek,
	setVolume,
	setDuration,
	reportProgress,
	trackEnded,
	subscribe,
	type PlayerState,
	type PlayerStatus,
} from "./player.js";
import * as Queue from "./queue.js";

function createTrack(id: string, title = "Test Track"): Queue.QueueTrack {
	return {
		id,
		title,
		artist: "Test Artist",
		album: "Test Album",
		duration: 180,
		artworkUrl: null,
		source: "ytmusic",
	};
}

describe("getState", () => {
	beforeEach(() => {
		stop();
	});

	it("returns stopped state after stop", () => {
		const state = getState();
		expect(state.status).toBe("stopped");
		expect(state.currentTrack).toBeNull();
		expect(state.progress).toBe(0);
	});

	it("includes queue context", () => {
		const state = getState();
		expect(state.queueContext).toBeDefined();
		expect(state.queueContext.type).toBe("manual");
	});
});

describe("play", () => {
	beforeEach(() => {
		stop();
	});

	it("starts playback with tracks", () => {
		const tracks = [createTrack("1"), createTrack("2")];
		play(tracks, { type: "album", albumId: "test" });

		const state = getState();
		expect(state.status).toBe("playing");
		expect(state.currentTrack?.id).toBe("1");
	});

	it("starts from specified index", () => {
		const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];
		play(tracks, { type: "manual" }, 2);

		const state = getState();
		expect(state.currentTrack?.id).toBe("3");
	});

	it("sets duration from track", () => {
		const tracks = [createTrack("1")];
		play(tracks, { type: "manual" });

		const state = getState();
		expect(state.duration).toBe(180);
	});

	it("stops when no tracks provided and queue empty", () => {
		play();

		const state = getState();
		expect(state.status).toBe("stopped");
	});

	it("sets queue context", () => {
		const tracks = [createTrack("1")];
		play(tracks, { type: "radio", seedId: "station1" });

		const state = getState();
		expect(state.queueContext.type).toBe("radio");
	});
});

describe("pause", () => {
	beforeEach(() => {
		stop();
	});

	it("pauses when playing", () => {
		play([createTrack("1")], { type: "manual" });
		pause();

		const state = getState();
		expect(state.status).toBe("paused");
	});

	it("is no-op when not playing", () => {
		pause();
		const state = getState();
		expect(state.status).toBe("stopped");
	});
});

describe("resume", () => {
	beforeEach(() => {
		stop();
	});

	it("resumes when paused", () => {
		play([createTrack("1")], { type: "manual" });
		pause();
		resume();

		const state = getState();
		expect(state.status).toBe("playing");
	});

	it("is no-op when not paused", () => {
		play([createTrack("1")], { type: "manual" });
		resume();

		const state = getState();
		expect(state.status).toBe("playing");
	});
});

describe("stop", () => {
	beforeEach(() => {
		stop();
	});

	it("stops playback and clears queue", () => {
		play([createTrack("1")], { type: "manual" });
		stop();

		const state = getState();
		expect(state.status).toBe("stopped");
		expect(state.currentTrack).toBeNull();
		expect(state.progress).toBe(0);
		expect(state.duration).toBe(0);
	});
});

describe("skip", () => {
	beforeEach(() => {
		stop();
	});

	it("advances to next track", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" });
		const next = skip();

		expect(next?.id).toBe("2");
		expect(getState().status).toBe("playing");
	});

	it("stops at end of queue", () => {
		play([createTrack("1")], { type: "manual" });
		const next = skip();

		expect(next).toBeUndefined();
		expect(getState().status).toBe("stopped");
	});

	it("resets progress on skip", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" });
		seek(60);
		skip();

		const state = getState();
		expect(state.progress).toBe(0);
	});
});

describe("previousTrack", () => {
	beforeEach(() => {
		stop();
	});

	it("goes to previous track", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" }, 1);
		const prev = previousTrack();

		expect(prev?.id).toBe("1");
		expect(getState().status).toBe("playing");
	});

	it("returns undefined at start", () => {
		play([createTrack("1")], { type: "manual" });
		const prev = previousTrack();

		expect(prev).toBeUndefined();
	});

	it("resets progress when going back", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" }, 1);
		seek(60);
		previousTrack();

		const state = getState();
		expect(state.progress).toBe(0);
	});
});

describe("jumpToIndex", () => {
	beforeEach(() => {
		stop();
	});

	it("jumps to valid index", () => {
		play([createTrack("1"), createTrack("2"), createTrack("3")], { type: "manual" });
		const track = jumpToIndex(2);

		expect(track?.id).toBe("3");
		expect(getState().status).toBe("playing");
	});

	it("returns undefined for invalid index", () => {
		play([createTrack("1")], { type: "manual" });

		expect(jumpToIndex(-1)).toBeUndefined();
		expect(jumpToIndex(5)).toBeUndefined();
	});

	it("resets progress when jumping", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" });
		seek(60);
		jumpToIndex(1);

		const state = getState();
		expect(state.progress).toBe(0);
	});
});

describe("seek", () => {
	beforeEach(() => {
		stop();
	});

	it("sets progress", () => {
		play([createTrack("1")], { type: "manual" });
		seek(60);

		// When paused, progress is stored value
		pause();
		const state = getState();
		expect(state.progress).toBeGreaterThanOrEqual(60);
	});

	it("clamps to valid range", () => {
		play([createTrack("1")], { type: "manual" });
		setDuration(120);

		seek(-10);
		pause();
		expect(getState().progress).toBe(0);

		seek(200);
		expect(getState().progress).toBe(120);
	});
});

describe("setVolume", () => {
	beforeEach(() => {
		stop();
	});

	it("sets volume", () => {
		setVolume(50);
		expect(getState().volume).toBe(50);
	});

	it("clamps to valid range", () => {
		setVolume(-10);
		expect(getState().volume).toBe(0);

		setVolume(150);
		expect(getState().volume).toBe(100);
	});
});

describe("setDuration", () => {
	beforeEach(() => {
		stop();
	});

	it("sets track duration", () => {
		play([createTrack("1")], { type: "manual" });
		setDuration(240);

		expect(getState().duration).toBe(240);
	});
});

describe("reportProgress", () => {
	beforeEach(() => {
		stop();
	});

	it("updates progress silently", () => {
		play([createTrack("1")], { type: "manual" });
		pause();

		// Track that progress was updated
		reportProgress(45);
		expect(getState().progress).toBe(45);
	});
});

describe("trackEnded", () => {
	beforeEach(() => {
		stop();
	});

	it("advances to next track", () => {
		play([createTrack("1"), createTrack("2")], { type: "manual" });
		const next = trackEnded();

		expect(next?.id).toBe("2");
	});

	it("stops at end of queue", () => {
		play([createTrack("1")], { type: "manual" });
		const next = trackEnded();

		expect(next).toBeUndefined();
		expect(getState().status).toBe("stopped");
	});
});

describe("subscribe", () => {
	beforeEach(() => {
		stop();
	});

	it("notifies on state changes", () => {
		const states: PlayerState[] = [];
		const unsubscribe = subscribe((state) => states.push(state));

		play([createTrack("1")], { type: "manual" });

		expect(states.length).toBeGreaterThanOrEqual(1);
		expect(states[states.length - 1]?.status).toBe("playing");

		unsubscribe();
	});

	it("stops notifying after unsubscribe", () => {
		const states: PlayerState[] = [];
		const unsubscribe = subscribe((state) => states.push(state));

		play([createTrack("1")], { type: "manual" });
		const countAfterPlay = states.length;

		unsubscribe();

		pause();
		expect(states.length).toBe(countAfterPlay);
	});
});

describe("PlayerStatus type", () => {
	it("supports all valid values", () => {
		const statuses: PlayerStatus[] = ["playing", "paused", "stopped"];
		expect(statuses.length).toBe(3);
	});
});

describe("PlayerState type", () => {
	it("has correct shape", () => {
		const state = getState();

		expect("status" in state).toBe(true);
		expect("currentTrack" in state).toBe(true);
		expect("nextTrack" in state).toBe(true);
		expect("progress" in state).toBe(true);
		expect("duration" in state).toBe(true);
		expect("volume" in state).toBe(true);
		expect("updatedAt" in state).toBe(true);
		expect("queueContext" in state).toBe(true);
	});
});
