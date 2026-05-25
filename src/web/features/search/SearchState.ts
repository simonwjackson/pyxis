/**
 * @module SearchState
 *
 * Pure domain ADT for the search page. Combines the `search.unified`
 * query with `library.albumStates.resolve` so the page composes
 * state-specific surfaces (`Idle`, `Loading`, `Empty`, `Results`,
 * `LoadError`, `Defect`) instead of branching on raw `AsyncResult`
 * primitives and React Query enabled/loading flags.
 *
 * `Idle` is the explicit replacement for the legacy
 * `useQuery({ enabled: query.length >= 2 })` guard: short queries never
 * launch a network request and the page must render the discover
 * placeholder rather than an empty Ready state.
 *
 * The Ready case carries the search results already merged with their
 * matching library album states so the JSX renders an already-joined
 * view rather than recomputing the lookup map on every render.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiLibraryAlbumState } from "../../../api/contracts/library.js";
import type {
	ApiPandoraSearchArtist,
	ApiPandoraSearchGenreStation,
	ApiSearchAlbum,
	ApiSearchResponse,
	ApiSearchTrack,
} from "../../../api/contracts/search.js";
import type { SearchAlbum } from "./types";

/** Minimum query length that triggers a unified search request. */
export const SEARCH_MIN_QUERY_LENGTH = 2;

export type SearchResults = {
	readonly tracks: readonly ApiSearchTrack[];
	readonly albums: readonly SearchAlbum[];
	readonly pandoraArtists: readonly ApiPandoraSearchArtist[];
	readonly pandoraGenres: readonly ApiPandoraSearchGenreStation[];
};

export type SearchState =
	| { readonly _tag: "Idle" }
	| { readonly _tag: "Loading" }
	| { readonly _tag: "Empty" }
	| { readonly _tag: "Results"; readonly results: SearchResults }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const SearchState = {
	/**
	 * Compute the page state for a given query and the two AsyncResults that
	 * back it. The library-states result is allowed to be `Idle` (waiting for
	 * the unified search to settle); only its decoded `Success` payload is
	 * used to join state badges onto albums.
	 */
	fromResults(
		query: string,
		searchResult: AsyncResult.AsyncResult<ApiSearchResponse, ApiPublicError>,
		statesResult: AsyncResult.AsyncResult<
			readonly ApiLibraryAlbumState[],
			ApiPublicError
		>,
	): SearchState {
		if (query.length < SEARCH_MIN_QUERY_LENGTH) {
			return { _tag: "Idle" };
		}

		return AsyncResult.matchWithWaiting(searchResult, {
			onWaiting: (): SearchState => ({ _tag: "Loading" }),
			onError: (error): SearchState => ({ _tag: "LoadError", error }),
			onDefect: (defect): SearchState => ({ _tag: "Defect", defect }),
			onSuccess: (success): SearchState => {
				const statesByKey = projectStateMap(statesResult);
				const albums = joinAlbums(success.value.albums, statesByKey);
				const hasResults =
					success.value.tracks.length > 0 ||
					albums.length > 0 ||
					success.value.pandoraArtists.length > 0 ||
					success.value.pandoraGenres.length > 0;
				if (!hasResults) return { _tag: "Empty" };
				return {
					_tag: "Results",
					results: {
						tracks: success.value.tracks,
						albums,
						pandoraArtists: success.value.pandoraArtists,
						pandoraGenres: success.value.pandoraGenres,
					},
				};
			},
		});
	},
};

function projectStateMap(
	statesResult: AsyncResult.AsyncResult<
		readonly ApiLibraryAlbumState[],
		ApiPublicError
	>,
): ReadonlyMap<string, ApiLibraryAlbumState> {
	if (!AsyncResult.isSuccess(statesResult)) return new Map();
	const entries = statesResult.value.map(
		(state) => [state.sourceId, state] as const,
	);
	return new Map(entries);
}

function joinAlbums(
	albums: readonly ApiSearchAlbum[],
	statesByKey: ReadonlyMap<string, ApiLibraryAlbumState>,
): readonly SearchAlbum[] {
	return albums.map((album) => {
		const matched = findMatchedState(album.sourceIds, statesByKey);
		const base: SearchAlbum = {
			id: album.id,
			title: album.title,
			artist: album.artist,
			sourceIds: album.sourceIds,
			...(album.year != null ? { year: album.year } : {}),
			...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
			...(album.genres != null ? { genres: album.genres } : {}),
			...(album.releaseType != null ? { releaseType: album.releaseType } : {}),
		};
		if (matched === undefined) return base;
		if (matched.albumId === undefined || matched.placement === undefined) {
			return base;
		}
		return {
			...base,
			state: {
				albumId: matched.albumId,
				placement: matched.placement,
				isHot: matched.isHot ?? false,
			},
		};
	});
}

function findMatchedState(
	sourceIds: readonly string[],
	statesByKey: ReadonlyMap<string, ApiLibraryAlbumState>,
): ApiLibraryAlbumState | undefined {
	for (const sourceId of sourceIds) {
		const found = statesByKey.get(sourceId);
		if (found !== undefined) return found;
	}
	return undefined;
}
