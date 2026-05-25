import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	CreatePlaylistRadioInputSchema,
	CreatePlaylistRadioResultSchema,
	PlaylistListSchema,
	PlaylistSchema,
	PlaylistTrackSchema,
	PlaylistTracksInputSchema,
} from "./playlist.js";

describe("playlist API contracts", () => {
	it("decodes playlists with required source and optional metadata", () => {
		const playlist = Schema.decodeUnknownSync(PlaylistSchema)({
			id: "ytmusic:playlist_1",
			name: "Playlist",
			source: "ytmusic",
			capabilities: { radio: true },
		});
		expect(playlist.source).toBe("ytmusic");
		expect(playlist.capabilities?.radio).toBe(true);
		expect(playlist.description).toBeUndefined();
	});

	it("decodes list of playlists", () => {
		expect(
			Schema.decodeUnknownSync(PlaylistListSchema)([
				{ id: "ytmusic:playlist_1", name: "Playlist", source: "ytmusic" },
			]),
		).toHaveLength(1);
	});

	it("rejects playlists with unknown source", () => {
		expect(() =>
			Schema.decodeUnknownSync(PlaylistSchema)({
				id: "evil:playlist",
				name: "Playlist",
				source: "evil",
			}),
		).toThrow();
	});

	it("requires source-prefixed playlist ids when fetching tracks", () => {
		expect(
			Schema.decodeUnknownSync(PlaylistTracksInputSchema)({
				id: "ytmusic:playlist_1",
			}),
		).toEqual({ id: "ytmusic:playlist_1" });
		expect(() =>
			Schema.decodeUnknownSync(PlaylistTracksInputSchema)({ id: "barenanoid" }),
		).toThrow();
	});

	it("decodes playlist tracks with capabilities", () => {
		expect(
			Schema.decodeUnknownSync(PlaylistTrackSchema)({
				id: "ytmusic:track_1",
				title: "Track",
				artist: "Artist",
				album: "Album",
				capabilities: {
					feedback: false,
					sleep: false,
					bookmark: false,
					explain: false,
					radio: true,
				},
			}),
		).toMatchObject({ id: "ytmusic:track_1" });
	});

	it("bounds create-radio input fields and accepts known track id shapes", () => {
		expect(
			Schema.decodeUnknownSync(CreatePlaylistRadioInputSchema)({
				trackId: "ytmusic:track_1",
				name: "My Radio",
				artworkUrl: "https://example.test/art.jpg",
			}),
		).toMatchObject({ name: "My Radio" });
		expect(() =>
			Schema.decodeUnknownSync(CreatePlaylistRadioInputSchema)({
				trackId: "evil:track_1",
				name: "My Radio",
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(CreatePlaylistRadioInputSchema)({
				trackId: "ytmusic:track_1",
				name: "x".repeat(129),
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(CreatePlaylistRadioInputSchema)({
				trackId: "ytmusic:track_1",
				name: "",
			}),
		).toThrow();
	});

	it("decodes the create-radio result wire shape", () => {
		expect(
			Schema.decodeUnknownSync(CreatePlaylistRadioResultSchema)({
				id: "ytmusic:radio-track_1",
				url: "https://music.youtube.com/watch?v=track_1&list=RDAMVMtrack_1",
			}),
		).toMatchObject({ id: "ytmusic:radio-track_1" });
	});
});
