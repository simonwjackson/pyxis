import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPandoraSearchResponse } from "../../../api/contracts/search.js";
import { AddSeedDialogState } from "./AddSeedDialogState.js";

const emptyResponse: ApiPandoraSearchResponse = {};

describe("AddSeedDialogState.fromResult", () => {
	it("is Prompt while the user has not entered a query", () => {
		const state = AddSeedDialogState.fromResult("", AsyncResult.initial(false));
		expect(state).toEqual({ _tag: "Prompt" });
	});

	it("is Searching while the debounced search is in flight", () => {
		const state = AddSeedDialogState.fromResult(
			"sub",
			AsyncResult.initial(true),
		);
		expect(state).toEqual({ _tag: "Searching", query: "sub" });
	});

	it("is Empty when the search completes with no artists or songs", () => {
		const result = AsyncResult.success<ApiPandoraSearchResponse>(emptyResponse);
		expect(AddSeedDialogState.fromResult("none", result)).toEqual({
			_tag: "Empty",
			query: "none",
		});
	});

	it("is Results with projected artists and songs", () => {
		const response: ApiPandoraSearchResponse = {
			artists: [
				{ musicToken: "tA", artistName: "Artist A" },
				{ musicToken: "tB", artistName: "Artist B" },
			],
			songs: [
				{
					musicToken: "tC",
					songName: "Song C",
					artistName: "Artist C",
				},
			],
		};
		const result = AsyncResult.success<ApiPandoraSearchResponse>(response);
		expect(AddSeedDialogState.fromResult("term", result)).toEqual({
			_tag: "Results",
			query: "term",
			artists: [
				{ musicToken: "tA", artistName: "Artist A" },
				{ musicToken: "tB", artistName: "Artist B" },
			],
			songs: [
				{
					musicToken: "tC",
					songName: "Song C",
					artistName: "Artist C",
				},
			],
		});
	});

	it("returns LoadError for typed public RPC failures", () => {
		const error = {
			_tag: "Unauthorized" as const,
			reason: "no credentials",
		};
		const result = AsyncResult.failure<ApiPandoraSearchResponse, typeof error>(
			Cause.fail(error),
		);
		expect(AddSeedDialogState.fromResult("x", result)).toEqual({
			_tag: "LoadError",
			error,
		});
	});

	it("returns Defect for non-typed failures", () => {
		const defect = new Error("boom");
		const result = AsyncResult.failure<ApiPandoraSearchResponse, never>(
			Cause.die(defect),
		);
		const state = AddSeedDialogState.fromResult("x", result);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") {
			expect(state.defect).toBe(defect);
		}
	});
});
