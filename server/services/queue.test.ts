/**
 * @module queue tests
 * Tests for playback queue management.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
	getState,
	setQueue,
	addTracks,
	removeTrack,
	jumpTo,
	next,
	previous,
	currentTrack,
	nextTrack,
	clear,
	shuffle,
	appendTracks,
	subscribe,
	setAutoFetchHandler,
	type QueueTrack,
	type QueueContext,
	type QueueState,
} from "./queue.js";

function createTrack(id: string, title = "Test Track"): QueueTrack {
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
		clear();
	});

	it("returns empty state after clear", () => {
		const state = getState();
		expect(state.items).toEqual([]);
		expect(state.currentIndex).toBe(0);
		expect(state.context.type).toBe("manual");
	});
});

describe("setQueue", () => {
	beforeEach(() => {
		clear();
	});

	it("sets tracks and context", () => {
		const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];
		const context: QueueContext = { type: "album", albumId: "test-album" };

		setQueue(tracks, context);

		const state = getState();
		expect(state.items.length).toBe(3);
		expect(state.currentIndex).toBe(0);
		expect(state.context).toEqual(context);
	});

	it("sets starting index", () => {
		const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];

		setQueue(tracks, { type: "manual" }, 2);

		const state = getState();
		expect(state.currentIndex).toBe(2);
	});

	it("replaces existing queue", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" });
		setQueue([createTrack("3")], { type: "radio", seedId: "station1" });

		const state = getState();
		expect(state.items.length).toBe(1);
		expect(state.items[0]?.id).toBe("3");
		expect(state.context.type).toBe("radio");
	});
});

describe("addTracks", () => {
	beforeEach(() => {
		clear();
	});

	it("appends to end by default", () => {
		setQueue([createTrack("1")], { type: "manual" });
		addTracks([createTrack("2"), createTrack("3")]);

		const state = getState();
		expect(state.items.length).toBe(3);
		expect(state.items[1]?.id).toBe("2");
		expect(state.items[2]?.id).toBe("3");
	});

	it("inserts after current when insertNext is true", () => {
		setQueue([createTrack("1"), createTrack("2"), createTrack("3")], { type: "manual" }, 0);
		addTracks([createTrack("new1"), createTrack("new2")], true);

		const state = getState();
		expect(state.items.length).toBe(5);
		expect(state.items[0]?.id).toBe("1");
		expect(state.items[1]?.id).toBe("new1");
		expect(state.items[2]?.id).toBe("new2");
		expect(state.items[3]?.id).toBe("2");
	});
});

describe("removeTrack", () => {
	beforeEach(() => {
		clear();
	});

	it("removes track at index", () => {
		setQueue([createTrack("1"), createTrack("2"), createTrack("3")], { type: "manual" });
		removeTrack(1);

		const state = getState();
		expect(state.items.length).toBe(2);
		expect(state.items[0]?.id).toBe("1");
		expect(state.items[1]?.id).toBe("3");
	});

	it("adjusts currentIndex when removing before current", () => {
		setQueue([createTrack("1"), createTrack("2"), createTrack("3")], { type: "manual" }, 2);
		removeTrack(0);

		const state = getState();
		expect(state.currentIndex).toBe(1);
	});

	it("adjusts currentIndex when removing current at end", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" }, 1);
		removeTrack(1);

		const state = getState();
		expect(state.currentIndex).toBe(0);
	});

	it("ignores invalid indices", () => {
		setQueue([createTrack("1")], { type: "manual" });
		removeTrack(-1);
		removeTrack(5);

		const state = getState();
		expect(state.items.length).toBe(1);
	});
});

describe("jumpTo", () => {
	beforeEach(() => {
		clear();
	});

	it("jumps to valid index and returns track", () => {
		setQueue([createTrack("1"), createTrack("2"), createTrack("3")], { type: "manual" });
		const track = jumpTo(2);

		expect(track?.id).toBe("3");
		expect(getState().currentIndex).toBe(2);
	});

	it("returns undefined for invalid index", () => {
		setQueue([createTrack("1")], { type: "manual" });

		expect(jumpTo(-1)).toBeUndefined();
		expect(jumpTo(5)).toBeUndefined();
	});
});

describe("next", () => {
	beforeEach(() => {
		clear();
	});

	it("advances and returns next track", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" });
		const track = next();

		expect(track?.id).toBe("2");
		expect(getState().currentIndex).toBe(1);
	});

	it("returns undefined at end of queue", () => {
		setQueue([createTrack("1")], { type: "manual" });
		const track = next();

		expect(track).toBeUndefined();
		expect(getState().currentIndex).toBe(0);
	});
});

describe("previous", () => {
	beforeEach(() => {
		clear();
	});

	it("goes back and returns previous track", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" }, 1);
		const track = previous();

		expect(track?.id).toBe("1");
		expect(getState().currentIndex).toBe(0);
	});

	it("returns undefined at start of queue", () => {
		setQueue([createTrack("1")], { type: "manual" });
		const track = previous();

		expect(track).toBeUndefined();
		expect(getState().currentIndex).toBe(0);
	});
});

describe("currentTrack", () => {
	beforeEach(() => {
		clear();
	});

	it("returns current track", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" }, 1);

		const track = currentTrack();
		expect(track?.id).toBe("2");
	});

	it("returns undefined when empty", () => {
		const track = currentTrack();
		expect(track).toBeUndefined();
	});
});

describe("nextTrack", () => {
	beforeEach(() => {
		clear();
	});

	it("returns next track without advancing", () => {
		setQueue([createTrack("1"), createTrack("2")], { type: "manual" });

		const track = nextTrack();
		expect(track?.id).toBe("2");
		expect(getState().currentIndex).toBe(0);
	});

	it("returns undefined at end", () => {
		setQueue([createTrack("1")], { type: "manual" });

		const track = nextTrack();
		expect(track).toBeUndefined();
	});
});

describe("clear", () => {
	it("clears all tracks and resets context", () => {
		setQueue([createTrack("1")], { type: "album", albumId: "test" });
		clear();

		const state = getState();
		expect(state.items).toEqual([]);
		expect(state.currentIndex).toBe(0);
		expect(state.context.type).toBe("manual");
	});
});

describe("shuffle", () => {
	beforeEach(() => {
		clear();
	});

	it("keeps current track at index 0", () => {
		setQueue(
			[createTrack("1"), createTrack("2"), createTrack("3"), createTrack("4")],
			{ type: "manual" },
			2,
		);

		shuffle();

		const state = getState();
		expect(state.items[0]?.id).toBe("3"); // Was at index 2
		expect(state.currentIndex).toBe(0);
		expect(state.items.length).toBe(4);
	});

	it("does nothing for single track", () => {
		setQueue([createTrack("1")], { type: "manual" });
		shuffle();

		const state = getState();
		expect(state.items.length).toBe(1);
	});

	it("does nothing for empty queue", () => {
		shuffle();
		const state = getState();
		expect(state.items).toEqual([]);
	});
});

describe("appendTracks", () => {
	beforeEach(() => {
		clear();
	});

	it("appends tracks to end", () => {
		setQueue([createTrack("1")], { type: "manual" });
		appendTracks([createTrack("2"), createTrack("3")]);

		const state = getState();
		expect(state.items.length).toBe(3);
		expect(state.items[2]?.id).toBe("3");
	});
});

describe("subscribe", () => {
	beforeEach(() => {
		clear();
	});

	it("notifies on state changes", () => {
		const states: QueueState[] = [];
		const unsubscribe = subscribe((state) => states.push(state));

		setQueue([createTrack("1")], { type: "manual" });

		expect(states.length).toBe(1);
		expect(states[0]?.items.length).toBe(1);

		unsubscribe();
	});

	it("stops notifying after unsubscribe", () => {
		const states: QueueState[] = [];
		const unsubscribe = subscribe((state) => states.push(state));

		setQueue([createTrack("1")], { type: "manual" });
		unsubscribe();
		setQueue([createTrack("2")], { type: "manual" });

		expect(states.length).toBe(1);
	});
});

describe("QueueTrack type", () => {
	it("has correct shape", () => {
		const track: QueueTrack = {
			id: "ytmusic:abc123",
			title: "Test Song",
			artist: "Test Artist",
			album: "Test Album",
			duration: 240,
			artworkUrl: "https://example.com/art.jpg",
			source: "ytmusic",
		};

		expect(track.id).toBe("ytmusic:abc123");
		expect(track.source).toBe("ytmusic");
	});

	it("allows null duration and artwork", () => {
		const track: QueueTrack = {
			id: "pandora:xyz",
			title: "Track",
			artist: "Artist",
			album: "Album",
			duration: null,
			artworkUrl: null,
			source: "pandora",
		};

		expect(track.duration).toBeNull();
		expect(track.artworkUrl).toBeNull();
	});
});

describe("QueueContext type", () => {
	it("supports radio context", () => {
		const ctx: QueueContext = { type: "radio", seedId: "station123" };
		expect(ctx.type).toBe("radio");
		if (ctx.type === "radio") {
			expect(ctx.seedId).toBe("station123");
		}
	});

	it("supports album context", () => {
		const ctx: QueueContext = { type: "album", albumId: "album456" };
		expect(ctx.type).toBe("album");
		if (ctx.type === "album") {
			expect(ctx.albumId).toBe("album456");
		}
	});

	it("supports playlist context", () => {
		const ctx: QueueContext = { type: "playlist", playlistId: "playlist789" };
		expect(ctx.type).toBe("playlist");
		if (ctx.type === "playlist") {
			expect(ctx.playlistId).toBe("playlist789");
		}
	});

	it("supports manual context", () => {
		const ctx: QueueContext = { type: "manual" };
		expect(ctx.type).toBe("manual");
	});
});
