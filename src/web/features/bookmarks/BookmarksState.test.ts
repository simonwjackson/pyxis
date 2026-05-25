import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiBookmarksResponse } from "../../../api/contracts/library.js";
import { BookmarksState } from "./BookmarksState.js";

describe("BookmarksState.fromResult", () => {
	it("returns Loading while the bookmarks RPC is initial", () => {
		const state = BookmarksState.fromResult(AsyncResult.initial(true));
		expect(state._tag).toBe("Loading");
	});

	it("returns Empty when the user has no artist or song bookmarks", () => {
		const result = AsyncResult.success<ApiBookmarksResponse>({});
		expect(BookmarksState.fromResult(result)).toEqual({ _tag: "Empty" });
	});

	it("returns Empty when both arrays are present but contain no usable rows", () => {
		const result = AsyncResult.success<ApiBookmarksResponse>({
			artists: [
				// Missing musicToken — would be unusable for the create-station action.
				{ bookmarkToken: "bm_orphan", artistName: "Orphan" },
			],
			songs: [],
		});
		expect(BookmarksState.fromResult(result)).toEqual({ _tag: "Empty" });
	});

	it("projects artist and song bookmarks into the page row shape", () => {
		const result = AsyncResult.success<ApiBookmarksResponse>({
			artists: [
				{
					bookmarkToken: "bm_artist_1",
					musicToken: "mt_artist_1",
					artistName: "Artist One",
				},
			],
			songs: [
				{
					bookmarkToken: "bm_song_1",
					musicToken: "mt_song_1",
					songName: "Song One",
					artistName: "Artist One",
				},
			],
		});

		expect(BookmarksState.fromResult(result)).toEqual({
			_tag: "Ready",
			artists: [
				{
					bookmarkToken: "bm_artist_1",
					musicToken: "mt_artist_1",
					artistName: "Artist One",
				},
			],
			songs: [
				{
					bookmarkToken: "bm_song_1",
					musicToken: "mt_song_1",
					songName: "Song One",
					artistName: "Artist One",
				},
			],
		});
	});

	it("drops song bookmarks missing musicToken, songName, or artistName", () => {
		const result = AsyncResult.success<ApiBookmarksResponse>({
			songs: [
				{
					bookmarkToken: "bm_complete",
					musicToken: "mt_complete",
					songName: "Complete",
					artistName: "Artist",
				},
				{
					bookmarkToken: "bm_missing_token",
					songName: "No Token",
					artistName: "Artist",
				},
				{
					bookmarkToken: "bm_missing_song",
					musicToken: "mt_missing_song",
					artistName: "Artist",
				},
			],
		});

		const state = BookmarksState.fromResult(result);
		expect(state._tag).toBe("Ready");
		if (state._tag === "Ready") {
			expect(state.songs).toHaveLength(1);
			expect(state.songs[0]?.bookmarkToken).toBe("bm_complete");
		}
	});

	it("returns LoadError for typed public RPC failures", () => {
		const error = {
			_tag: "Unauthorized" as const,
			code: "no_credentials",
		};
		const result = AsyncResult.failure<ApiBookmarksResponse, typeof error>(
			Cause.fail(error),
		);
		expect(BookmarksState.fromResult(result)).toEqual({
			_tag: "LoadError",
			error,
		});
	});

	it("returns Defect for non-error failures", () => {
		const defect = new Error("transport boom");
		const result = AsyncResult.failure<ApiBookmarksResponse, never>(
			Cause.die(defect),
		);
		const state = BookmarksState.fromResult(result);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") {
			expect(state.defect).toBe(defect);
		}
	});
});
