import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiLibraryAlbumState } from "../../../api/contracts/library.js";
import type {
	ApiSearchAlbum,
	ApiSearchResponse,
	ApiSearchTrack,
} from "../../../api/contracts/search.js";
import { SearchState } from "./SearchState.js";

const emptyResponse: ApiSearchResponse = {
	tracks: [],
	albums: [],
	pandoraArtists: [],
	pandoraGenres: [],
};

const track = (id = "ytmusic:t1"): ApiSearchTrack => ({
	id,
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
});

const album = (overrides?: Partial<ApiSearchAlbum>): ApiSearchAlbum => ({
	id: "ytmusic:album-1",
	title: "Album",
	artist: "Artist",
	sourceIds: ["ytmusic:album-1"],
	...overrides,
});

describe("SearchState.fromResults", () => {
	it("is Idle when the query is shorter than the minimum length", () => {
		expect(
			SearchState.fromResults(
				"a",
				AsyncResult.initial<ApiSearchResponse>(),
				AsyncResult.initial<readonly ApiLibraryAlbumState[]>(),
			),
		).toEqual({ _tag: "Idle" });
	});

	it("is Idle for an empty query even when the result atoms have data", () => {
		expect(
			SearchState.fromResults(
				"",
				AsyncResult.success<ApiSearchResponse>(emptyResponse),
				AsyncResult.success<readonly ApiLibraryAlbumState[]>([]),
			),
		).toEqual({ _tag: "Idle" });
	});

	it("is Loading when the unified search is in flight for a long-enough query", () => {
		expect(
			SearchState.fromResults(
				"jazz",
				AsyncResult.initial<ApiSearchResponse>(true),
				AsyncResult.initial<readonly ApiLibraryAlbumState[]>(true),
			),
		).toEqual({ _tag: "Loading" });
	});

	it("is Empty when the search succeeds with no results across all sections", () => {
		expect(
			SearchState.fromResults(
				"jazz",
				AsyncResult.success<ApiSearchResponse>(emptyResponse),
				AsyncResult.success<readonly ApiLibraryAlbumState[]>([]),
			),
		).toEqual({ _tag: "Empty" });
	});

	it("is Results with tracks-only when only tracks are returned", () => {
		const tracks = [track()];
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.success<ApiSearchResponse>({
				...emptyResponse,
				tracks,
			}),
			AsyncResult.success<readonly ApiLibraryAlbumState[]>([]),
		);
		expect(state._tag).toBe("Results");
		if (state._tag === "Results") {
			expect(state.results.tracks).toEqual(tracks);
			expect(state.results.albums).toEqual([]);
		}
	});

	it("joins library album states with matching source ids, including isHot", () => {
		const albums = [album()];
		const states: readonly ApiLibraryAlbumState[] = [
			{
				sourceId: "ytmusic:album-1",
				albumId: "lib_album_1",
				placement: "discovery",
				isHot: true,
			},
		];
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.success<ApiSearchResponse>({
				...emptyResponse,
				albums,
			}),
			AsyncResult.success<readonly ApiLibraryAlbumState[]>(states),
		);
		expect(state._tag).toBe("Results");
		if (state._tag === "Results") {
			expect(state.results.albums[0]?.state).toEqual({
				albumId: "lib_album_1",
				placement: "discovery",
				isHot: true,
			});
		}
	});

	it("defaults isHot to false when the resolved state omits the hot signal", () => {
		const albums = [album()];
		const states: readonly ApiLibraryAlbumState[] = [
			{
				sourceId: "ytmusic:album-1",
				albumId: "lib_album_2",
				placement: "collection",
			},
		];
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.success<ApiSearchResponse>({
				...emptyResponse,
				albums,
			}),
			AsyncResult.success<readonly ApiLibraryAlbumState[]>(states),
		);
		expect(state._tag).toBe("Results");
		if (state._tag === "Results") {
			expect(state.results.albums[0]?.state).toEqual({
				albumId: "lib_album_2",
				placement: "collection",
				isHot: false,
			});
		}
	});

	it("leaves albums un-joined when the library states resolve is still pending", () => {
		const albums = [album()];
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.success<ApiSearchResponse>({
				...emptyResponse,
				albums,
			}),
			AsyncResult.initial<readonly ApiLibraryAlbumState[]>(true),
		);
		expect(state._tag).toBe("Results");
		if (state._tag === "Results") {
			expect(state.results.albums[0]?.state).toBeUndefined();
		}
	});

	it("ignores resolved states with no albumId or placement", () => {
		const albums = [album()];
		const states: readonly ApiLibraryAlbumState[] = [
			{ sourceId: "ytmusic:album-1" },
		];
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.success<ApiSearchResponse>({
				...emptyResponse,
				albums,
			}),
			AsyncResult.success<readonly ApiLibraryAlbumState[]>(states),
		);
		expect(state._tag).toBe("Results");
		if (state._tag === "Results") {
			expect(state.results.albums[0]?.state).toBeUndefined();
		}
	});

	it("is LoadError for typed public errors from the search RPC", () => {
		const error = {
			_tag: "SourceUnavailable" as const,
			code: "offline" as const,
		};
		expect(
			SearchState.fromResults(
				"jazz",
				AsyncResult.failure<ApiSearchResponse, typeof error>(Cause.fail(error)),
				AsyncResult.initial<readonly ApiLibraryAlbumState[]>(),
			),
		).toEqual({ _tag: "LoadError", error });
	});

	it("is Defect when the search RPC fails with a defect", () => {
		const defect = new Error("transport");
		const state = SearchState.fromResults(
			"jazz",
			AsyncResult.failure<ApiSearchResponse>(Cause.die(defect)),
			AsyncResult.initial<readonly ApiLibraryAlbumState[]>(),
		);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") expect(state.defect).toBe(defect);
	});
});
