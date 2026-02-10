/**
 * @module stream tests
 * Tests for audio streaming proxy and caching logic.
 */

import { describe, it, expect } from "bun:test";
import {
	parseTrackId,
	encodeTrackId,
	resolveStreamUrl,
	handleStreamRequest,
	prefetchToCache,
	type StreamRequest,
} from "./stream.js";
import type { SourceManager } from "../../src/sources/index.js";

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

describe("resolveStreamUrl", () => {
	it("resolves a ytmusic track URL", async () => {
		const mockSourceManager = {
			getStreamUrl: async (source: string, trackId: string) => {
				return `https://example.com/stream/${source}/${trackId}`;
			},
		} as unknown as SourceManager;

		const url = await resolveStreamUrl(mockSourceManager, "ytmusic:abc123");
		expect(url).toBe("https://example.com/stream/ytmusic/abc123");
	});

	it("resolves a pandora track URL", async () => {
		const mockSourceManager = {
			getStreamUrl: async (_source: string, trackId: string) => {
				return `https://pandora.com/audio/${trackId}.mp3`;
			},
		} as unknown as SourceManager;

		const url = await resolveStreamUrl(mockSourceManager, "pandora:track456");
		expect(url).toBe("https://pandora.com/audio/track456.mp3");
	});

	it("resolves a legacy pandora track (no colon)", async () => {
		const mockSourceManager = {
			getStreamUrl: async (source: string, trackId: string) => {
				expect(source).toBe("pandora");
				return `https://pandora.com/audio/${trackId}.mp3`;
			},
		} as unknown as SourceManager;

		const url = await resolveStreamUrl(mockSourceManager, "legacytrackid");
		expect(url).toBe("https://pandora.com/audio/legacytrackid.mp3");
	});

	it("handles track IDs with colons", async () => {
		const mockSourceManager = {
			getStreamUrl: async (source: string, trackId: string) => {
				return `https://example.com/${source}/${trackId}`;
			},
		} as unknown as SourceManager;

		const url = await resolveStreamUrl(mockSourceManager, "bandcamp:artist:track:123");
		expect(url).toBe("https://example.com/bandcamp/artist:track:123");
	});

	it("propagates errors from sourceManager", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => {
				throw new Error("Source unavailable");
			},
		} as unknown as SourceManager;

		await expect(resolveStreamUrl(mockSourceManager, "ytmusic:fail")).rejects.toThrow("Source unavailable");
	});
});

describe("handleStreamRequest", () => {
	it("returns upstream error response when fetch fails", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://example.com/404",
		} as unknown as SourceManager;

		// Mock fetch to return 404
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response("Not found", { status: 404 });

		try {
			const response = await handleStreamRequest(mockSourceManager, "ytmusic:notfound", null);
			expect(response.status).toBe(404);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("passes through pandora streams without caching", async () => {
		const audioData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
		const mockSourceManager = {
			getStreamUrl: async () => "https://pandora.com/audio.mp3",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(audioData, {
			status: 200,
			headers: { "Content-Type": "audio/mpeg", "Content-Length": "5" },
		});

		try {
			const response = await handleStreamRequest(mockSourceManager, "pandora:track123", null);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			const body = await response.arrayBuffer();
			expect(new Uint8Array(body)).toEqual(audioData);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("passes range header to upstream for pandora", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://pandora.com/audio.mp3",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = (init?.headers as Record<string, string>) ?? {};
			return new Response(new Uint8Array([0x01, 0x02]), {
				status: 206,
				headers: {
					"Content-Type": "audio/mpeg",
					"Content-Range": "bytes 100-101/1000",
				},
			});
		};

		try {
			const response = await handleStreamRequest(mockSourceManager, "pandora:track123", "bytes=100-101");
			expect(capturedHeaders["Range"]).toBe("bytes=100-101");
			expect(response.status).toBe(206);
			expect(response.headers.get("Content-Range")).toBe("bytes 100-101/1000");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("handles upstream with accept-ranges header", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://pandora.com/audio.mp3",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(new Uint8Array([0x01]), {
			status: 200,
			headers: {
				"Content-Type": "audio/mpeg",
				"Accept-Ranges": "bytes",
			},
		});

		try {
			const response = await handleStreamRequest(mockSourceManager, "pandora:track123", null);
			expect(response.headers.get("Accept-Ranges")).toBe("bytes");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("sets Accept-Ranges to bytes when upstream doesn't provide it", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://pandora.com/audio.mp3",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(new Uint8Array([0x01]), {
			status: 200,
			headers: { "Content-Type": "audio/mpeg" },
		});

		try {
			const response = await handleStreamRequest(mockSourceManager, "pandora:track123", null);
			expect(response.headers.get("Accept-Ranges")).toBe("bytes");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("exposes CORS headers on error responses", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://example.com/500",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response("Server error", {
			status: 500,
			headers: { "Content-Type": "text/plain" },
		});

		try {
			const response = await handleStreamRequest(mockSourceManager, "ytmusic:broken", null);
			expect(response.status).toBe(500);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Content-Type")).toBe("text/plain");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("handles resolve errors gracefully", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => {
				throw new Error("Failed to resolve URL");
			},
		} as unknown as SourceManager;

		await expect(
			handleStreamRequest(mockSourceManager, "ytmusic:broken", null)
		).rejects.toThrow("Failed to resolve URL");
	});
});

describe("prefetchToCache", () => {
	it("skips pandora tracks (short-lived URLs)", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => {
				throw new Error("Should not be called for pandora");
			},
		} as unknown as SourceManager;

		// Should not throw - pandora is skipped
		await prefetchToCache(mockSourceManager, "pandora:track123");
	});

	it("handles fetch errors gracefully", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://example.com/fail",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			throw new Error("Network error");
		};

		try {
			// Should not throw - errors are caught internally
			await prefetchToCache(mockSourceManager, "ytmusic:networkfail");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("handles upstream error responses gracefully", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://example.com/404",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response("Not found", { status: 404 });

		try {
			// Should not throw - errors are handled internally
			await prefetchToCache(mockSourceManager, "ytmusic:notfound");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("handles upstream response with no body", async () => {
		const mockSourceManager = {
			getStreamUrl: async () => "https://example.com/nobody",
		} as unknown as SourceManager;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(null, { status: 200 });

		try {
			// Should not throw - handled internally
			await prefetchToCache(mockSourceManager, "ytmusic:nobody");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
