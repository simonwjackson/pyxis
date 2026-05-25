import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { SearchResponseSchema } from "./search.js";

describe("search API contracts", () => {
	it("decodes the current unified search router response shape", () => {
		const response = Schema.decodeUnknownSync(SearchResponseSchema)({
			tracks: [
				{
					id: "ytmusic:track_1",
					title: "Track",
					artist: "Artist",
					album: "Album",
					duration: 180,
					artworkUrl: "https://example.test/art.jpg",
					capabilities: {
						feedback: false,
						sleep: false,
						bookmark: false,
						explain: false,
						radio: true,
					},
				},
			],
			albums: [
				{
					id: "ytmusic:album_1",
					title: "Album",
					artist: "Artist",
					year: 2024,
					artworkUrl: "https://example.test/album.jpg",
					sourceIds: ["ytmusic:album_1"],
					genres: ["rock"],
					releaseType: "album",
				},
			],
			pandoraArtists: [{ artistName: "Artist" }],
			pandoraGenres: [{ stationName: "Genre Radio" }],
		});

		expect(response.tracks[0]?.capabilities.radio).toBe(true);
		expect(response.albums[0]?.sourceIds).toEqual(["ytmusic:album_1"]);
	});

	it("rejects pre-router canonical shapes so contract drift is visible", () => {
		expect(() =>
			Schema.decodeUnknownSync(SearchResponseSchema)({
				tracks: [
					{
						id: "track_1",
						title: "Track",
						artist: "Artist",
						album: "Album",
						sourceId: { source: "ytmusic", id: "track_1" },
					},
				],
				albums: [],
				pandoraArtists: [],
				pandoraGenres: [],
			}),
		).toThrow();
	});
});
