/**
 * @module youtube tests
 * Tests for YouTube chapter-based album source.
 */

import { describe, it, expect } from "bun:test";
import {
	extractVideoId,
	decodeChapterTrackId,
	encodeChapterTrackId,
} from "./index.js";

describe("decodeChapterTrackId", () => {
	it("parses a normal chapter track ID", () => {
		const result = decodeChapterTrackId("6uJ0eRFQszo@0-245.5");
		expect(result).toEqual({
			videoId: "6uJ0eRFQszo",
			startTime: 0,
			endTime: 245.5,
		});
	});

	it("parses fractional start and end times", () => {
		const result = decodeChapterTrackId("abc123@12.75-98.333");
		expect(result).toEqual({
			videoId: "abc123",
			startTime: 12.75,
			endTime: 98.333,
		});
	});

	it("returns null when no @ delimiter", () => {
		expect(decodeChapterTrackId("6uJ0eRFQszo")).toBeNull();
	});

	it("returns null when no dash in time part", () => {
		expect(decodeChapterTrackId("6uJ0eRFQszo@123")).toBeNull();
	});

	it("returns null for non-numeric times", () => {
		expect(decodeChapterTrackId("6uJ0eRFQszo@abc-def")).toBeNull();
	});

	it("returns null for empty video ID", () => {
		expect(decodeChapterTrackId("@0-100")).toBeNull();
	});

	it("handles zero start time", () => {
		const result = decodeChapterTrackId("vid123@0-300");
		expect(result).toEqual({
			videoId: "vid123",
			startTime: 0,
			endTime: 300,
		});
	});

	it("handles video IDs with hyphens and underscores", () => {
		const result = decodeChapterTrackId("a-b_c-D@10-20");
		expect(result).toEqual({
			videoId: "a-b_c-D",
			startTime: 10,
			endTime: 20,
		});
	});
});

describe("encodeChapterTrackId", () => {
	it("encodes a chapter track ID", () => {
		expect(encodeChapterTrackId("6uJ0eRFQszo", 0, 245.5)).toBe(
			"6uJ0eRFQszo@0-245.5",
		);
	});

	it("is symmetric with decodeChapterTrackId", () => {
		const encoded = encodeChapterTrackId("vid123", 12.5, 98.333);
		const decoded = decodeChapterTrackId(encoded);
		expect(decoded).toEqual({
			videoId: "vid123",
			startTime: 12.5,
			endTime: 98.333,
		});
	});
});

describe("extractVideoId", () => {
	it("extracts from youtube.com/watch URL", () => {
		expect(
			extractVideoId("https://www.youtube.com/watch?v=6uJ0eRFQszo"),
		).toBe("6uJ0eRFQszo");
	});

	it("extracts from youtube.com/watch with extra params", () => {
		expect(
			extractVideoId(
				"https://www.youtube.com/watch?v=6uJ0eRFQszo&t=120",
			),
		).toBe("6uJ0eRFQszo");
	});

	it("extracts from youtu.be short URL", () => {
		expect(extractVideoId("https://youtu.be/6uJ0eRFQszo")).toBe(
			"6uJ0eRFQszo",
		);
	});

	it("extracts from youtube.com/embed URL", () => {
		expect(
			extractVideoId("https://www.youtube.com/embed/6uJ0eRFQszo"),
		).toBe("6uJ0eRFQszo");
	});

	it("returns null for non-YouTube URLs", () => {
		expect(extractVideoId("https://example.com/watch?v=abc")).toBeNull();
	});

	it("returns null for plain text queries", () => {
		expect(extractVideoId("pink floyd dark side of the moon")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractVideoId("")).toBeNull();
	});

	it("extracts from URL without protocol prefix in query", () => {
		expect(
			extractVideoId("youtube.com/watch?v=6uJ0eRFQszo"),
		).toBe("6uJ0eRFQszo");
	});
});
