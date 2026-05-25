import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	PandoraSearchInputSchema,
	PandoraSearchResponseSchema,
	SearchInputSchema,
	SearchResponseSchema,
} from "./search.js";

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
			pandoraArtists: [{ artistName: "Artist", musicToken: "music_token_1" }],
			pandoraGenres: [
				{ stationName: "Genre Radio", musicToken: "music_token_2" },
			],
		});

		expect(response.tracks[0]?.capabilities.radio).toBe(true);
		expect(response.albums[0]?.sourceIds).toEqual(["ytmusic:album_1"]);
		expect(response.pandoraArtists[0]?.musicToken).toBe("music_token_1");
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

	it("bounds search input length", () => {
		expect(
			Schema.decodeUnknownSync(SearchInputSchema)({ query: "abc" }),
		).toEqual({
			query: "abc",
		});
		expect(() =>
			Schema.decodeUnknownSync(SearchInputSchema)({ query: "" }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(SearchInputSchema)({
				query: "x".repeat(257),
			}),
		).toThrow();
	});

	it("bounds Pandora search input length and key name", () => {
		expect(
			Schema.decodeUnknownSync(PandoraSearchInputSchema)({
				searchText: "abba",
			}),
		).toEqual({ searchText: "abba" });
		expect(() =>
			Schema.decodeUnknownSync(PandoraSearchInputSchema)({ searchText: "" }),
		).toThrow();
	});

	it("decodes Pandora-only search results with optional artist/song/genre arrays", () => {
		const decoded = Schema.decodeUnknownSync(PandoraSearchResponseSchema)({
			artists: [{ artistName: "Artist", musicToken: "tok" }],
			songs: [
				{
					songName: "Song",
					artistName: "Artist",
					musicToken: "tok2",
				},
			],
			genreStations: [{ stationName: "Genre", musicToken: "tok3" }],
		});
		expect(decoded.artists?.[0]?.artistName).toBe("Artist");
		expect(decoded.songs?.[0]?.songName).toBe("Song");
		expect(decoded.genreStations?.[0]?.stationName).toBe("Genre");
	});

	it("rejects Pandora search entries missing the music token", () => {
		expect(() =>
			Schema.decodeUnknownSync(PandoraSearchResponseSchema)({
				artists: [{ artistName: "Artist" }],
			}),
		).toThrow();
	});
});
