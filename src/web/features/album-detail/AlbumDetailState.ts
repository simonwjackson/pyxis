/**
 * @module AlbumDetailState
 *
 * Pure domain ADTs for the two album detail composition roots:
 *
 *  - {@link LibraryAlbumDetailState} combines `library.album.get` (which
 *    returns `LibraryAlbum | null`) with `library.albumTracks.list` so the
 *    library detail page renders named states instead of branching on two
 *    raw `AsyncResult`s and a nullable `data` payload.
 *  - {@link SourceAlbumDetailState} combines `album.withTracks.get` with
 *    `library.albumStates.resolve` so the source detail page can decide
 *    whether to expose placement controls without sprinkling `data?.[0]`
 *    optional chains through the JSX.
 *
 * Both ADTs intentionally model `NotFound` only where it can actually
 * happen: the legacy library detail rendered a "not found" message when
 * `library.album.get` resolved to `null`. The source detail surfaces
 * "album not found" only when the upstream call resolves to a falsy
 * payload, which is not currently observable through the Effect contract
 * (`album.withTracks.get` errors instead). The Source ADT therefore omits
 * the `NotFound` case and lets typed `NotFound` public errors fall through
 * to `LoadError`, mirroring the legacy render behavior.
 *
 * The library-states query in the source ADT is treated as auxiliary
 * data: `Ready` carries `libraryState: null` when the states query has
 * errored or returned no row, matching the legacy fallback where the
 * page rendered without placement controls.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { AlbumPlacement } from "@/web/shared/lib/library-placement";
import type { ApiSourceAlbumWithTracks } from "../../../api/contracts/album.js";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type {
	ApiLibraryAlbum,
	ApiLibraryAlbumState,
	ApiLibraryAlbumTrack,
} from "../../../api/contracts/library.js";

/** Library-detail ADT: `library.album.get` + `library.albumTracks.list`. */
export type LibraryAlbumDetailState =
	| { readonly _tag: "Loading" }
	| { readonly _tag: "NotFound" }
	| {
			readonly _tag: "Ready";
			readonly album: ApiLibraryAlbum;
			readonly tracks: readonly ApiLibraryAlbumTrack[];
	  }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const LibraryAlbumDetailState = {
	fromResults(
		albumResult: AsyncResult.AsyncResult<
			ApiLibraryAlbum | null,
			ApiPublicError
		>,
		tracksResult: AsyncResult.AsyncResult<
			readonly ApiLibraryAlbumTrack[],
			ApiPublicError
		>,
	): LibraryAlbumDetailState {
		const albumState = AsyncResult.matchWithWaiting(albumResult, {
			onWaiting: (): LibraryAlbumDetailState => ({ _tag: "Loading" }),
			onError: (error): LibraryAlbumDetailState => ({
				_tag: "LoadError",
				error,
			}),
			onDefect: (defect): LibraryAlbumDetailState => ({
				_tag: "Defect",
				defect,
			}),
			onSuccess: (success): LibraryAlbumDetailState | ApiLibraryAlbum => {
				if (success.value === null) return { _tag: "NotFound" };
				return success.value;
			},
		});

		if (isLibraryState(albumState)) return albumState;

		return AsyncResult.matchWithWaiting(tracksResult, {
			onWaiting: (): LibraryAlbumDetailState => ({ _tag: "Loading" }),
			onError: (error): LibraryAlbumDetailState => ({
				_tag: "LoadError",
				error,
			}),
			onDefect: (defect): LibraryAlbumDetailState => ({
				_tag: "Defect",
				defect,
			}),
			onSuccess: (success): LibraryAlbumDetailState => ({
				_tag: "Ready",
				album: albumState,
				tracks: success.value,
			}),
		});
	},
};

function isLibraryState(
	value: LibraryAlbumDetailState | ApiLibraryAlbum,
): value is LibraryAlbumDetailState {
	return (
		typeof value === "object" &&
		value !== null &&
		"_tag" in value &&
		typeof (value as { _tag: unknown })._tag === "string"
	);
}

/**
 * Projected library-state payload joined onto a source album. `albumId`
 * is the library-album id the source maps to (when one exists); the legacy
 * page used it to decide whether placement controls were available.
 */
export type SourceAlbumLibraryState = {
	readonly albumId?: string | undefined;
	readonly placement?: AlbumPlacement | undefined;
	readonly isHot: boolean;
};

/** Source-detail ADT: `album.withTracks.get` + `library.albumStates.resolve`. */
export type SourceAlbumDetailState =
	| { readonly _tag: "Loading" }
	| {
			readonly _tag: "Ready";
			readonly album: ApiSourceAlbumWithTracks["album"];
			readonly tracks: ApiSourceAlbumWithTracks["tracks"];
			readonly libraryState: SourceAlbumLibraryState | null;
	  }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const SourceAlbumDetailState = {
	fromResults(
		withTracksResult: AsyncResult.AsyncResult<
			ApiSourceAlbumWithTracks,
			ApiPublicError
		>,
		statesResult: AsyncResult.AsyncResult<
			readonly ApiLibraryAlbumState[],
			ApiPublicError
		>,
	): SourceAlbumDetailState {
		const sourceState = AsyncResult.matchWithWaiting(withTracksResult, {
			onWaiting: (): SourceAlbumDetailState => ({ _tag: "Loading" }),
			onError: (error): SourceAlbumDetailState => ({
				_tag: "LoadError",
				error,
			}),
			onDefect: (defect): SourceAlbumDetailState => ({
				_tag: "Defect",
				defect,
			}),
			onSuccess: (success): SourceAlbumDetailState | ApiSourceAlbumWithTracks =>
				success.value,
		});

		if (isSourceState(sourceState)) return sourceState;

		// Preserve the legacy "wait for both queries" behavior: while the
		// library-states resolver is still loading, keep the page in `Loading`
		// so placement controls do not flash empty.
		if (AsyncResult.isWaiting(statesResult)) {
			return { _tag: "Loading" };
		}

		return {
			_tag: "Ready",
			album: sourceState.album,
			tracks: sourceState.tracks,
			libraryState: projectLibraryState(statesResult),
		};
	},
};

function isSourceState(
	value: SourceAlbumDetailState | ApiSourceAlbumWithTracks,
): value is SourceAlbumDetailState {
	return (
		typeof value === "object" &&
		value !== null &&
		"_tag" in value &&
		typeof (value as { _tag: unknown })._tag === "string"
	);
}

function projectLibraryState(
	statesResult: AsyncResult.AsyncResult<
		readonly ApiLibraryAlbumState[],
		ApiPublicError
	>,
): SourceAlbumLibraryState | null {
	if (!AsyncResult.isSuccess(statesResult)) return null;
	const first = statesResult.value[0];
	if (first === undefined) return null;
	return {
		...(first.albumId !== undefined ? { albumId: first.albumId } : {}),
		...(first.placement !== undefined ? { placement: first.placement } : {}),
		isHot: first.isHot ?? false,
	};
}
