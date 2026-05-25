import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiLibraryAlbum } from "../../../api/contracts/library.js";
import type { ApiPlaylist } from "../../../api/contracts/playlist.js";
import { HomeState } from "./HomeState.js";

const sampleAlbum = (
	overrides: Partial<ApiLibraryAlbum> = {},
): ApiLibraryAlbum => ({
	id: "album_1",
	title: "Album",
	artist: "Artist",
	placement: "discovery",
	placementUpdatedAt: 1,
	sourceIds: ["ytmusic:remote_1"],
	isHot: false,
	hotRank: null,
	...overrides,
});

describe("HomeState.albumShelfFromResult", () => {
	it("returns Loading while the album RPC is initial", () => {
		const state = HomeState.albumShelfFromResult(AsyncResult.initial(true));
		expect(state._tag).toBe("Loading");
	});

	it("returns Ready with an empty list when the shelf has no albums", () => {
		const result = AsyncResult.success<readonly ApiLibraryAlbum[]>([]);
		expect(HomeState.albumShelfFromResult(result)).toEqual({
			_tag: "Ready",
			items: [],
		});
	});

	it("projects library album wire rows into AlbumData view shape", () => {
		const albums: readonly ApiLibraryAlbum[] = [
			sampleAlbum({
				id: "album_hot",
				title: "Hot Album",
				artist: "Artist",
				year: 2024,
				artworkUrl: "https://art/hot.jpg",
				placement: "discovery",
				isHot: true,
				hotRank: 2,
			}),
			sampleAlbum({
				id: "album_cold",
				title: "Cold Album",
				artist: "Artist",
				placement: "collection",
				isHot: false,
				hotRank: null,
			}),
		];

		const state = HomeState.albumShelfFromResult(AsyncResult.success(albums));
		expect(state).toEqual({
			_tag: "Ready",
			items: [
				{
					id: "album_hot",
					title: "Hot Album",
					artist: "Artist",
					year: 2024,
					artworkUrl: "https://art/hot.jpg",
					placement: "discovery",
					placementUpdatedAt: 1,
					isHot: true,
					hotRank: 2,
				},
				{
					id: "album_cold",
					title: "Cold Album",
					artist: "Artist",
					year: null,
					artworkUrl: null,
					placement: "collection",
					placementUpdatedAt: 1,
					isHot: false,
					hotRank: null,
				},
			],
		});
	});

	it("returns LoadError for typed public RPC failures", () => {
		const error = {
			_tag: "PersistenceError" as const,
			code: "library_list_failed",
		};
		const result = AsyncResult.failure<
			readonly ApiLibraryAlbum[],
			typeof error
		>(Cause.fail(error));
		expect(HomeState.albumShelfFromResult(result)).toEqual({
			_tag: "LoadError",
			error,
		});
	});

	it("returns Defect for non-error failures", () => {
		const defect = new Error("transport boom");
		const result = AsyncResult.failure<readonly ApiLibraryAlbum[], never>(
			Cause.die(defect),
		);
		const state = HomeState.albumShelfFromResult(result);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") {
			expect(state.defect).toBe(defect);
		}
	});
});

describe("HomeState.playlistShelfFromResult", () => {
	it("returns Loading while the playlist RPC is initial", () => {
		const state = HomeState.playlistShelfFromResult(AsyncResult.initial(true));
		expect(state._tag).toBe("Loading");
	});

	it("returns Ready with an empty list when the user has no playlists", () => {
		const result = AsyncResult.success<readonly ApiPlaylist[]>([]);
		expect(HomeState.playlistShelfFromResult(result)).toEqual({
			_tag: "Ready",
			items: [],
		});
	});

	it("projects playlist wire rows into PlaylistData view shape", () => {
		const playlists: readonly ApiPlaylist[] = [
			{
				id: "pl_with_art",
				name: "With Art",
				source: "pandora",
				artworkUrl: "https://art/pl.jpg",
			},
			{
				id: "pl_no_art",
				name: "No Art",
				source: "ytmusic",
			},
		];

		const state = HomeState.playlistShelfFromResult(
			AsyncResult.success(playlists),
		);
		expect(state).toEqual({
			_tag: "Ready",
			items: [
				{
					id: "pl_with_art",
					name: "With Art",
					artworkUrl: "https://art/pl.jpg",
				},
				{
					id: "pl_no_art",
					name: "No Art",
				},
			],
		});
	});

	it("returns LoadError for typed public RPC failures", () => {
		const error = {
			_tag: "Unauthorized" as const,
			code: "no_credentials",
		};
		const result = AsyncResult.failure<readonly ApiPlaylist[], typeof error>(
			Cause.fail(error),
		);
		expect(HomeState.playlistShelfFromResult(result)).toEqual({
			_tag: "LoadError",
			error,
		});
	});
});
