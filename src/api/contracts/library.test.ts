import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	AddBookmarkInputSchema,
	BookmarksResponseSchema,
	HotAlbumsInputSchema,
	LibraryAlbumSchema,
	LibraryAlbumStateSchema,
	LibraryAlbumTrackSchema,
	ListLibraryAlbumsInputSchema,
	RemoveBookmarkInputSchema,
	ResolveAlbumStatesInputSchema,
	SaveAlbumInputSchema,
	SaveAlbumResultSchema,
	SetAlbumPlacementInputSchema,
	UpdateAlbumInputSchema,
	UpdateLibraryTrackInputSchema,
} from "./library.js";

describe("library API contracts", () => {
	it("accepts current library album wire shape including hot-shelf fields", () => {
		const album = Schema.decodeUnknownSync(LibraryAlbumSchema)({
			id: "album_1",
			title: "Album",
			artist: "Artist",
			placement: "discovery",
			placementUpdatedAt: 1,
			sourceIds: ["ytmusic:remote_album_1"],
			isHot: true,
			hotRank: 3,
		});

		expect(album.placement).toBe("discovery");
		expect(album.sourceIds).toEqual(["ytmusic:remote_album_1"]);
		expect(album.isHot).toBe(true);
		expect(album.hotRank).toBe(3);
	});

	it("accepts null hotRank when an album is not currently hot", () => {
		const album = Schema.decodeUnknownSync(LibraryAlbumSchema)({
			id: "album_2",
			title: "Album",
			artist: "Artist",
			placement: "collection",
			placementUpdatedAt: 1,
			sourceIds: ["ytmusic:remote_album_2"],
			isHot: false,
			hotRank: null,
		});

		expect(album.isHot).toBe(false);
		expect(album.hotRank).toBeNull();
	});

	it("rejects library album payloads missing the hot-shelf fields", () => {
		expect(() =>
			Schema.decodeUnknownSync(LibraryAlbumSchema)({
				id: "album_3",
				title: "Album",
				artist: "Artist",
				placement: "discovery",
				placementUpdatedAt: 1,
				sourceIds: ["ytmusic:remote_album_3"],
			}),
		).toThrow();
	});

	it("rejects invalid placements in command results", () => {
		expect(() =>
			Schema.decodeUnknownSync(SaveAlbumResultSchema)({
				id: "album_1",
				outcome: "created",
				placement: "favorites",
			}),
		).toThrow();
	});

	it("encodes library album tracks with explicit capabilities", () => {
		const track = Schema.decodeUnknownSync(LibraryAlbumTrackSchema)({
			id: "track_1",
			trackIndex: 0,
			title: "Track",
			artist: "Artist",
			duration: 180,
			capabilities: {
				feedback: false,
				sleep: false,
				bookmark: false,
				explain: false,
				radio: true,
			},
		});
		expect(track.capabilities.radio).toBe(true);
		expect(track.artworkUrl).toBeUndefined();
	});

	it("decodes library state with optional album id and placement", () => {
		const state = Schema.decodeUnknownSync(LibraryAlbumStateSchema)({
			sourceId: "ytmusic:album",
		});
		expect(state.sourceId).toBe("ytmusic:album");
		expect(state.albumId).toBeUndefined();
		expect(state.placement).toBeUndefined();
	});

	it("accepts the current library albums query filters", () => {
		expect(
			Schema.decodeUnknownSync(ListLibraryAlbumsInputSchema)({
				placements: ["discovery", "collection"],
				includeArchive: true,
				hotOnly: false,
			}),
		).toMatchObject({ includeArchive: true });
	});

	it("rejects unknown placements in list filters", () => {
		expect(() =>
			Schema.decodeUnknownSync(ListLibraryAlbumsInputSchema)({
				placements: ["favorites"],
			}),
		).toThrow();
	});

	it("bounds hot album limit and rejects out-of-range values", () => {
		expect(
			Schema.decodeUnknownSync(HotAlbumsInputSchema)({
				includeDismissed: true,
				limit: 20,
			}),
		).toEqual({ includeDismissed: true, limit: 20 });
		expect(() =>
			Schema.decodeUnknownSync(HotAlbumsInputSchema)({ limit: 0 }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(HotAlbumsInputSchema)({ limit: 101 }),
		).toThrow();
	});

	it("requires source-prefixed ids when saving an album", () => {
		expect(
			Schema.decodeUnknownSync(SaveAlbumInputSchema)({
				id: "ytmusic:album_1",
			}),
		).toEqual({ id: "ytmusic:album_1" });
		expect(() =>
			Schema.decodeUnknownSync(SaveAlbumInputSchema)({ id: "nanoidLike" }),
		).toThrow();
	});

	it("rejects empty source id arrays-of-strings inputs", () => {
		expect(() =>
			Schema.decodeUnknownSync(ResolveAlbumStatesInputSchema)({
				sourceIds: [""],
			}),
		).toThrow();
	});

	it("rejects placement command payloads with bad placements", () => {
		expect(() =>
			Schema.decodeUnknownSync(SetAlbumPlacementInputSchema)({
				albumId: "album_1",
				placement: "favorites",
			}),
		).toThrow();
	});

	it("requires at least one updated field when editing an album", () => {
		expect(
			Schema.decodeUnknownSync(UpdateAlbumInputSchema)({
				id: "album_1",
				title: "New",
			}),
		).toMatchObject({ title: "New" });
		expect(() =>
			Schema.decodeUnknownSync(UpdateAlbumInputSchema)({ id: "album_1" }),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(UpdateAlbumInputSchema)({
				id: "album_1",
				title: "   ",
			}),
		).toThrow();
	});

	it("requires a non-empty title when renaming a library track", () => {
		expect(
			Schema.decodeUnknownSync(UpdateLibraryTrackInputSchema)({
				id: "track_1",
				title: "Renamed",
			}),
		).toMatchObject({ title: "Renamed" });
		expect(() =>
			Schema.decodeUnknownSync(UpdateLibraryTrackInputSchema)({
				id: "track_1",
				title: "  ",
			}),
		).toThrow();
	});

	it("requires a known track id and bookmark type when adding a bookmark", () => {
		expect(
			Schema.decodeUnknownSync(AddBookmarkInputSchema)({
				id: "pandora:track_token",
				type: "song",
			}),
		).toMatchObject({ type: "song" });
		expect(() =>
			Schema.decodeUnknownSync(AddBookmarkInputSchema)({
				id: "pandora:track_token",
				type: "playlist",
			}),
		).toThrow();
		expect(() =>
			Schema.decodeUnknownSync(AddBookmarkInputSchema)({
				id: "evil:track_token",
				type: "song",
			}),
		).toThrow();
	});

	it("requires a bookmark token when removing", () => {
		expect(
			Schema.decodeUnknownSync(RemoveBookmarkInputSchema)({
				bookmarkToken: "bm_1",
				type: "song",
			}),
		).toMatchObject({ bookmarkToken: "bm_1" });
		expect(() =>
			Schema.decodeUnknownSync(RemoveBookmarkInputSchema)({
				bookmarkToken: "",
				type: "song",
			}),
		).toThrow();
	});

	it("decodes Pandora bookmarks response with optional artist/song arrays", () => {
		const response = Schema.decodeUnknownSync(BookmarksResponseSchema)({
			artists: [
				{
					bookmarkToken: "bm_artist_1",
					artistName: "Artist",
				},
			],
			songs: [
				{
					bookmarkToken: "bm_song_1",
					songName: "Song",
					artistName: "Artist",
					albumName: "Album",
				},
			],
		});
		expect(response.artists?.[0]?.bookmarkToken).toBe("bm_artist_1");
		expect(response.songs?.[0]?.songName).toBe("Song");
	});
});
