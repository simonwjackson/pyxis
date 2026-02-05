/**
 * @module now-playing-utils tests
 * Tests for now playing track utilities.
 */

import { describe, it, expect } from "bun:test";
import {
	radioTrackToNowPlaying,
	playlistTrackToNowPlaying,
	albumTrackToNowPlaying,
	tracksToQueuePayload,
	shuffleArray,
	formatTime,
	type TrackCapabilities,
	type NowPlayingTrack,
	type AlbumTrackRow,
} from "./now-playing-utils";

const defaultCapabilities: TrackCapabilities = {
	feedback: false,
	sleep: false,
	bookmark: false,
	explain: false,
	radio: true,
};

const pandoraCapabilities: TrackCapabilities = {
	feedback: true,
	sleep: true,
	bookmark: true,
	explain: true,
	radio: true,
};

describe("radioTrackToNowPlaying", () => {
	it("converts a radio track with all fields", () => {
		const track = {
			id: "pandora:abc123",
			title: "Test Song",
			artist: "Test Artist",
			album: "Test Album",
			artworkUrl: "https://example.com/art.jpg",
			duration: 180,
			capabilities: pandoraCapabilities,
		};

		const result = radioTrackToNowPlaying(track);

		expect(result.id).toBe("pandora:abc123");
		expect(result.songName).toBe("Test Song");
		expect(result.artistName).toBe("Test Artist");
		expect(result.albumName).toBe("Test Album");
		expect(result.albumArtUrl).toBe("https://example.com/art.jpg");
		expect(result.duration).toBe(180);
		expect(result.capabilities).toBe(pandoraCapabilities);
	});

	it("handles null artworkUrl", () => {
		const track = {
			id: "pandora:abc123",
			title: "Test Song",
			artist: "Test Artist",
			album: "Test Album",
			artworkUrl: null,
			duration: 180,
			capabilities: defaultCapabilities,
		};

		const result = radioTrackToNowPlaying(track);

		expect(result.albumArtUrl).toBeUndefined();
	});

	it("handles null duration", () => {
		const track = {
			id: "pandora:abc123",
			title: "Test Song",
			artist: "Test Artist",
			album: "Test Album",
			duration: null,
			capabilities: defaultCapabilities,
		};

		const result = radioTrackToNowPlaying(track);

		expect(result.duration).toBeUndefined();
	});
});

describe("playlistTrackToNowPlaying", () => {
	it("converts a playlist track", () => {
		const track = {
			id: "ytmusic:dQw4w9WgXcQ",
			title: "Never Gonna Give You Up",
			artist: "Rick Astley",
			album: "Whenever You Need Somebody",
			artworkUrl: "https://example.com/rick.jpg",
			duration: 213,
			capabilities: defaultCapabilities,
		};

		const result = playlistTrackToNowPlaying(track);

		expect(result.id).toBe("ytmusic:dQw4w9WgXcQ");
		expect(result.songName).toBe("Never Gonna Give You Up");
		expect(result.artistName).toBe("Rick Astley");
		expect(result.albumArtUrl).toBe("https://example.com/rick.jpg");
		expect(result.duration).toBe(213);
	});

	it("handles undefined optional fields", () => {
		const track = {
			id: "ytmusic:abc",
			title: "Song",
			artist: "Artist",
			album: "Album",
			capabilities: defaultCapabilities,
		};

		const result = playlistTrackToNowPlaying(track);

		expect(result.albumArtUrl).toBeUndefined();
		expect(result.duration).toBeUndefined();
	});
});

describe("albumTrackToNowPlaying", () => {
	it("converts an album track row", () => {
		const track: AlbumTrackRow = {
			id: "track-1",
			trackIndex: 1,
			title: "Track One",
			artist: "Album Artist",
			duration: 240,
			artworkUrl: "https://example.com/track.jpg",
			capabilities: defaultCapabilities,
		};

		const result = albumTrackToNowPlaying(track, "The Album", "https://example.com/album.jpg");

		expect(result.id).toBe("track-1");
		expect(result.songName).toBe("Track One");
		expect(result.artistName).toBe("Album Artist");
		expect(result.albumName).toBe("The Album");
		expect(result.albumArtUrl).toBe("https://example.com/track.jpg");
		expect(result.duration).toBe(240);
	});

	it("uses album artwork as fallback", () => {
		const track: AlbumTrackRow = {
			id: "track-2",
			trackIndex: 2,
			title: "Track Two",
			artist: "Album Artist",
			duration: 180,
			artworkUrl: null,
			capabilities: defaultCapabilities,
		};

		const result = albumTrackToNowPlaying(track, "The Album", "https://example.com/album.jpg");

		expect(result.albumArtUrl).toBe("https://example.com/album.jpg");
	});

	it("handles null duration", () => {
		const track: AlbumTrackRow = {
			id: "track-3",
			trackIndex: 3,
			title: "Track Three",
			artist: "Album Artist",
			duration: null,
			artworkUrl: null,
			capabilities: defaultCapabilities,
		};

		const result = albumTrackToNowPlaying(track, "The Album", null);

		expect(result.duration).toBeUndefined();
		expect(result.albumArtUrl).toBeUndefined();
	});
});

describe("tracksToQueuePayload", () => {
	it("converts tracks to queue payload format", () => {
		const tracks: readonly NowPlayingTrack[] = [
			{
				id: "track-1",
				songName: "Song One",
				artistName: "Artist One",
				albumName: "Album One",
				albumArtUrl: "https://example.com/1.jpg",
				duration: 180,
				capabilities: defaultCapabilities,
			},
			{
				id: "track-2",
				songName: "Song Two",
				artistName: "Artist Two",
				albumName: "Album Two",
				capabilities: defaultCapabilities,
			},
		];

		const result = tracksToQueuePayload(tracks);

		expect(result.length).toBe(2);
		expect(result[0]).toEqual({
			id: "track-1",
			title: "Song One",
			artist: "Artist One",
			album: "Album One",
			duration: 180,
			artworkUrl: "https://example.com/1.jpg",
		});
		expect(result[1]).toEqual({
			id: "track-2",
			title: "Song Two",
			artist: "Artist Two",
			album: "Album Two",
			duration: null,
			artworkUrl: null,
		});
	});

	it("handles empty array", () => {
		const result = tracksToQueuePayload([]);
		expect(result.length).toBe(0);
	});
});

describe("shuffleArray", () => {
	it("returns a new array", () => {
		const original = [1, 2, 3, 4, 5];
		const shuffled = shuffleArray(original);

		expect(shuffled).not.toBe(original);
	});

	it("preserves array length", () => {
		const original = [1, 2, 3, 4, 5];
		const shuffled = shuffleArray(original);

		expect(shuffled.length).toBe(original.length);
	});

	it("contains all original elements", () => {
		const original = [1, 2, 3, 4, 5];
		const shuffled = shuffleArray(original);

		for (const item of original) {
			expect(shuffled).toContain(item);
		}
	});

	it("does not modify the original array", () => {
		const original = [1, 2, 3, 4, 5];
		const copy = [...original];
		shuffleArray(original);

		expect(original).toEqual(copy);
	});

	it("handles empty array", () => {
		const result = shuffleArray([]);
		expect(result).toEqual([]);
	});

	it("handles single element", () => {
		const result = shuffleArray([42]);
		expect(result).toEqual([42]);
	});
});

describe("formatTime", () => {
	it("formats zero seconds", () => {
		expect(formatTime(0)).toBe("0:00");
	});

	it("formats seconds less than a minute", () => {
		expect(formatTime(45)).toBe("0:45");
	});

	it("formats exactly one minute", () => {
		expect(formatTime(60)).toBe("1:00");
	});

	it("formats minutes and seconds", () => {
		expect(formatTime(185)).toBe("3:05");
	});

	it("pads single-digit seconds", () => {
		expect(formatTime(61)).toBe("1:01");
		expect(formatTime(69)).toBe("1:09");
	});

	it("handles large values", () => {
		expect(formatTime(3600)).toBe("60:00");
		expect(formatTime(3661)).toBe("61:01");
	});

	it("handles decimal values by flooring", () => {
		expect(formatTime(61.9)).toBe("1:01");
	});
});
