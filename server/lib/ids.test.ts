/**
 * @module IDs tests
 */

import { describe, it, expect } from "bun:test";
import {
	generateId,
	formatSourceId,
	parseId,
	buildStreamUrl,
	trackCapabilities,
	albumCapabilities,
	playlistCapabilities,
	resolveTrackForStream,
	resolveTrackSource,
} from "./ids.js";

describe("generateId", () => {
	it("returns a string", () => {
		const id = generateId();
		expect(typeof id).toBe("string");
	});

	it("returns a 10-character nanoid", () => {
		const id = generateId();
		expect(id.length).toBe(10);
	});

	it("generates unique ids", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateId());
		}
		expect(ids.size).toBe(100);
	});
});

describe("formatSourceId", () => {
	it("formats source and id with colon separator", () => {
		expect(formatSourceId("pandora", "abc123")).toBe("pandora:abc123");
		expect(formatSourceId("ytmusic", "video-id")).toBe("ytmusic:video-id");
	});

	it("handles empty id", () => {
		expect(formatSourceId("pandora", "")).toBe("pandora:");
	});

	it("handles id with special characters", () => {
		expect(formatSourceId("ytmusic", "abc:def")).toBe("ytmusic:abc:def");
	});
});

describe("parseId", () => {
	it("parses colon-prefixed source id", () => {
		const result = parseId("pandora:abc123");
		expect(result.source).toBe("pandora");
		expect(result.id).toBe("abc123");
	});

	it("parses ytmusic source id", () => {
		const result = parseId("ytmusic:dQw4w9WgXcQ");
		expect(result.source).toBe("ytmusic");
		expect(result.id).toBe("dQw4w9WgXcQ");
	});

	it("returns undefined source for bare nanoid", () => {
		const result = parseId("a3kF9x2abc");
		expect(result.source).toBeUndefined();
		expect(result.id).toBe("a3kF9x2abc");
	});

	it("handles id containing multiple colons", () => {
		const result = parseId("pandora:track:token:123");
		expect(result.source).toBe("pandora");
		expect(result.id).toBe("track:token:123");
	});

	it("handles empty id after colon", () => {
		const result = parseId("pandora:");
		expect(result.source).toBe("pandora");
		expect(result.id).toBe("");
	});
});

describe("buildStreamUrl", () => {
	it("builds base stream url without next hint", () => {
		const url = buildStreamUrl("pandora:abc123");
		expect(url).toBe("/stream/pandora%3Aabc123");
	});

	it("builds stream url with next track hint", () => {
		const url = buildStreamUrl("pandora:abc123", "pandora:next456");
		expect(url).toBe("/stream/pandora%3Aabc123?next=pandora%3Anext456");
	});

	it("handles nanoid format", () => {
		const url = buildStreamUrl("a3kF9x2abc");
		expect(url).toBe("/stream/a3kF9x2abc");
	});

	it("handles nanoid with next hint", () => {
		const url = buildStreamUrl("a3kF9x2abc", "b4lG0y3def");
		expect(url).toBe("/stream/a3kF9x2abc?next=b4lG0y3def");
	});

	it("properly encodes special characters", () => {
		const url = buildStreamUrl("ytmusic:abc+def");
		expect(url).toBe("/stream/ytmusic%3Aabc%2Bdef");
	});
});

describe("trackCapabilities", () => {
	it("returns full capabilities for pandora tracks", () => {
		const caps = trackCapabilities("pandora");

		expect(caps.feedback).toBe(true);
		expect(caps.sleep).toBe(true);
		expect(caps.bookmark).toBe(true);
		expect(caps.explain).toBe(true);
		expect(caps.radio).toBe(true);
	});

	it("returns limited capabilities for ytmusic tracks", () => {
		const caps = trackCapabilities("ytmusic");

		expect(caps.feedback).toBe(false);
		expect(caps.sleep).toBe(false);
		expect(caps.bookmark).toBe(false);
		expect(caps.explain).toBe(false);
		expect(caps.radio).toBe(true);
	});

	it("returns limited capabilities for other sources", () => {
		const sources = ["local", "musicbrainz", "discogs", "deezer", "bandcamp", "soundcloud"] as const;
		for (const source of sources) {
			const caps = trackCapabilities(source);
			expect(caps.feedback).toBe(false);
			expect(caps.sleep).toBe(false);
			expect(caps.bookmark).toBe(false);
			expect(caps.explain).toBe(false);
			expect(caps.radio).toBe(true);
		}
	});
});

describe("albumCapabilities", () => {
	it("returns radio capability for all sources", () => {
		const sources = ["pandora", "ytmusic", "local", "musicbrainz", "discogs"] as const;
		for (const source of sources) {
			const caps = albumCapabilities(source);
			expect(caps.radio).toBe(true);
		}
	});
});

describe("playlistCapabilities", () => {
	it("returns radio capability for all sources", () => {
		const sources = ["pandora", "ytmusic", "local", "musicbrainz", "discogs"] as const;
		for (const source of sources) {
			const caps = playlistCapabilities(source);
			expect(caps.radio).toBe(true);
		}
	});
});

describe("resolveTrackForStream", () => {

	it("returns source-prefixed ID as-is for pandora", async () => {
		const result = await resolveTrackForStream("pandora:tracktoken123");
		expect(result).toBe("pandora:tracktoken123");
	});

	it("returns source-prefixed ID as-is for ytmusic", async () => {
		const result = await resolveTrackForStream("ytmusic:dQw4w9WgXcQ");
		expect(result).toBe("ytmusic:dQw4w9WgXcQ");
	});

	it("returns source-prefixed ID as-is for bandcamp", async () => {
		const result = await resolveTrackForStream("bandcamp:12345");
		expect(result).toBe("bandcamp:12345");
	});

	it("returns source-prefixed ID as-is with colons in track ID", async () => {
		const result = await resolveTrackForStream("pandora:track:with:colons");
		expect(result).toBe("pandora:track:with:colons");
	});

	it("throws for unknown bare nanoid when DB lookup fails", async () => {
		// A bare nanoid should trigger DB lookup, which will fail for non-existent IDs
		await expect(resolveTrackForStream("unknownId1")).rejects.toThrow("Unknown track ID");
	});
});

describe("resolveTrackSource", () => {

	it("extracts source from pandora prefixed ID", async () => {
		const result = await resolveTrackSource("pandora:tracktoken123");
		expect(result).toBe("pandora");
	});

	it("extracts source from ytmusic prefixed ID", async () => {
		const result = await resolveTrackSource("ytmusic:dQw4w9WgXcQ");
		expect(result).toBe("ytmusic");
	});

	it("extracts source from bandcamp prefixed ID", async () => {
		const result = await resolveTrackSource("bandcamp:12345");
		expect(result).toBe("bandcamp");
	});

	it("extracts source from soundcloud prefixed ID", async () => {
		const result = await resolveTrackSource("soundcloud:track456");
		expect(result).toBe("soundcloud");
	});

	it("extracts source with colons in track ID", async () => {
		const result = await resolveTrackSource("pandora:track:with:many:colons");
		expect(result).toBe("pandora");
	});

	it("throws for unknown bare nanoid when DB lookup fails", async () => {
		await expect(resolveTrackSource("unknownId2")).rejects.toThrow("Unknown track ID");
	});
});
