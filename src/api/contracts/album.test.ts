import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	SourceAlbumIdInputSchema,
	SourceAlbumSchema,
	SourceAlbumTrackSchema,
	SourceAlbumWithTracksSchema,
} from "./album.js";

describe("source album API contracts", () => {
	it("requires source-prefixed ids for album endpoints", () => {
		expect(
			Schema.decodeUnknownSync(SourceAlbumIdInputSchema)({
				id: "ytmusic:album_1",
			}),
		).toEqual({ id: "ytmusic:album_1" });
		expect(() =>
			Schema.decodeUnknownSync(SourceAlbumIdInputSchema)({
				id: "nanoidLike01",
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(SourceAlbumIdInputSchema)({ id: ":missing" }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(SourceAlbumIdInputSchema)({ id: "missing:" }),
		).toThrow();
	});

	it("decodes a minimal source album payload", () => {
		expect(
			Schema.decodeUnknownSync(SourceAlbumSchema)({
				id: "ytmusic:album_1",
				title: "Album",
				artist: "Artist",
			}),
		).toMatchObject({ title: "Album" });
	});

	it("decodes the current getWithTracks shape with indexed tracks and capabilities", () => {
		const decoded = Schema.decodeUnknownSync(SourceAlbumWithTracksSchema)({
			album: {
				id: "ytmusic:album_1",
				title: "Album",
				artist: "Artist",
				year: 2024,
			},
			tracks: [
				{
					id: "ytmusic:track_1",
					trackIndex: 0,
					title: "Track",
					artist: "Artist",
					album: "Album",
					duration: 180,
					capabilities: {
						feedback: false,
						sleep: false,
						bookmark: false,
						explain: false,
						radio: true,
					},
				},
			],
		});
		expect(decoded.album.year).toBe(2024);
		expect(decoded.tracks[0]?.trackIndex).toBe(0);
		expect(decoded.tracks[0]?.capabilities.radio).toBe(true);
	});

	it("rejects album tracks missing required wire fields", () => {
		expect(() =>
			Schema.decodeUnknownSync(SourceAlbumTrackSchema)({
				id: "ytmusic:track_1",
				title: "Track",
			}),
		).toThrow();
	});

	it("rejects getWithTracks payloads missing capability flags", () => {
		expect(() =>
			Schema.decodeUnknownSync(SourceAlbumWithTracksSchema)({
				album: {
					id: "ytmusic:album_1",
					title: "Album",
					artist: "Artist",
				},
				tracks: [
					{
						id: "ytmusic:track_1",
						trackIndex: 0,
						title: "Track",
						artist: "Artist",
						album: "Album",
					},
				],
			}),
		).toThrow();
	});
});
