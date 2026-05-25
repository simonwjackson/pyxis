/**
 * @module PlaylistDetailState
 *
 * Pure domain ADT for the playlist detail page. It combines the playlist
 * list read (`playlist.list`) with the track read (`playlist.tracks.list`) so
 * the page renders named states instead of branching on two raw query atoms.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type {
	ApiPlaylist,
	ApiPlaylistTrack,
} from "../../../api/contracts/playlist.js";

export type PlaylistDetailState =
	| { readonly _tag: "Loading" }
	| { readonly _tag: "NotFound" }
	| {
			readonly _tag: "Ready";
			readonly playlist: ApiPlaylist;
			readonly tracks: readonly ApiPlaylistTrack[];
	  }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const PlaylistDetailState = {
	fromResults(
		playlistId: string,
		playlistsResult: AsyncResult.AsyncResult<
			readonly ApiPlaylist[],
			ApiPublicError
		>,
		tracksResult: AsyncResult.AsyncResult<
			readonly ApiPlaylistTrack[],
			ApiPublicError
		>,
	): PlaylistDetailState {
		const playlistState = AsyncResult.matchWithWaiting(playlistsResult, {
			onWaiting: (): PlaylistDetailState => ({ _tag: "Loading" }),
			onError: (error): PlaylistDetailState => ({ _tag: "LoadError", error }),
			onDefect: (defect): PlaylistDetailState => ({ _tag: "Defect", defect }),
			onSuccess: (success): PlaylistDetailState | ApiPlaylist => {
				const playlist = success.value.find((entry) => entry.id === playlistId);
				return playlist ?? { _tag: "NotFound" };
			},
		});

		if (isState(playlistState)) return playlistState;

		return AsyncResult.matchWithWaiting(tracksResult, {
			onWaiting: (): PlaylistDetailState => ({ _tag: "Loading" }),
			onError: (error): PlaylistDetailState => ({ _tag: "LoadError", error }),
			onDefect: (defect): PlaylistDetailState => ({ _tag: "Defect", defect }),
			onSuccess: (success): PlaylistDetailState => ({
				_tag: "Ready",
				playlist: playlistState,
				tracks: success.value,
			}),
		});
	},
};

function isState(
	value: PlaylistDetailState | ApiPlaylist,
): value is PlaylistDetailState {
	return typeof value === "object" && value !== null && "_tag" in value;
}
