/**
 * @module stream tests
 * Tests for audio streaming proxy and caching logic.
 */

import { describe, it, expect } from "bun:test";
import { parseTrackId, encodeTrackId, type StreamRequest } from "./stream.js";

describe("parseTrackId", () => {
	it("parses a pandora composite ID", () => {
		const result = parseTrackId("pandora:abc123");
		expect(result.source).toBe("pandora");
		expect(result.trackId).toBe("abc123");
	});

	it("parses a ytmusic composite ID", () => {
		const result = parseTrackId("ytmusic:dQw4w9WgXcQ");
		expect(result.source).toBe("ytmusic");
		expect(result.trackId).toBe("dQw4w9WgXcQ");
	});

	it("parses a bandcamp composite ID", () => {
		const result = parseTrackId("bandcamp:track123");
		expect(result.source).toBe("bandcamp");
		expect(result.trackId).toBe("track123");
	});

	it("parses a soundcloud composite ID", () => {
		const result = parseTrackId("soundcloud:song456");
		expect(result.source).toBe("soundcloud");
		expect(result.trackId).toBe("song456");
	});

	it("handles track IDs with colons in them", () => {
		const result = parseTrackId("pandora:track:token:with:colons");
		expect(result.source).toBe("pandora");
		expect(result.trackId).toBe("track:token:with:colons");
	});

	it("handles empty track ID after colon", () => {
		const result = parseTrackId("ytmusic:");
		expect(result.source).toBe("ytmusic");
		expect(result.trackId).toBe("");
	});

	it("defaults to pandora for IDs without colons", () => {
		const result = parseTrackId("abc123");
		expect(result.source).toBe("pandora");
		expect(result.trackId).toBe("abc123");
	});

	it("handles complex ytmusic IDs", () => {
		const result = parseTrackId("ytmusic:OLAK5uy_nUXE-test_id-123");
		expect(result.source).toBe("ytmusic");
		expect(result.trackId).toBe("OLAK5uy_nUXE-test_id-123");
	});
});

describe("encodeTrackId", () => {
	it("encodes pandora source and ID", () => {
		const result = encodeTrackId("pandora", "abc123");
		expect(result).toBe("pandora:abc123");
	});

	it("encodes ytmusic source and ID", () => {
		const result = encodeTrackId("ytmusic", "dQw4w9WgXcQ");
		expect(result).toBe("ytmusic:dQw4w9WgXcQ");
	});

	it("encodes bandcamp source and ID", () => {
		const result = encodeTrackId("bandcamp", "track123");
		expect(result).toBe("bandcamp:track123");
	});

	it("encodes soundcloud source and ID", () => {
		const result = encodeTrackId("soundcloud", "song456");
		expect(result).toBe("soundcloud:song456");
	});

	it("handles empty track ID", () => {
		const result = encodeTrackId("pandora", "");
		expect(result).toBe("pandora:");
	});

	it("handles track IDs with special characters", () => {
		const result = encodeTrackId("ytmusic", "abc:def:ghi");
		expect(result).toBe("ytmusic:abc:def:ghi");
	});

	it("is symmetric with parseTrackId", () => {
		const sources = ["pandora", "ytmusic", "bandcamp", "soundcloud"] as const;
		const trackIds = ["abc123", "test-track", "complex:id:here"];

		for (const source of sources) {
			for (const trackId of trackIds) {
				const encoded = encodeTrackId(source, trackId);
				const parsed = parseTrackId(encoded);
				expect(parsed.source).toBe(source);
				expect(parsed.trackId).toBe(trackId);
			}
		}
	});
});

describe("StreamRequest type", () => {
	it("has correct shape", () => {
		const request: StreamRequest = {
			source: "ytmusic",
			trackId: "abc123",
		};

		expect(request.source).toBe("ytmusic");
		expect(request.trackId).toBe("abc123");
	});

	it("allows all valid source types", () => {
		const sources = [
			"pandora",
			"ytmusic",
			"local",
			"musicbrainz",
			"discogs",
			"deezer",
			"bandcamp",
			"soundcloud",
		] as const;

		for (const source of sources) {
			const request: StreamRequest = {
				source,
				trackId: "test123",
			};
			expect(request.source).toBe(source);
		}
	});
});
