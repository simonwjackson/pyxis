/**
 * @module AddSeedDialogState
 *
 * Pure domain ADT for the add-seed dialog search panel. The legacy
 * implementation branched on `searchQuery.isFetching`, `hasResults`, and
 * the debounced query length scattered through JSX. The ADT makes the
 * panel's states explicit:
 *
 * - `Prompt`    — the user has not typed anything yet.
 * - `Searching` — debounced query is in flight.
 * - `Empty`     — search completed for `query` and returned no rows.
 * - `Results`   — search completed with at least one artist or song.
 * - `LoadError` — typed public RPC error.
 * - `Defect`    — non-typed failure (transport/unknown).
 *
 * Artists and songs are projected from `search.pandora`
 * ({@link ApiPandoraSearchResponse}) into the minimal shapes the dialog
 * rows render so view components stay source-agnostic.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiPandoraSearchResponse } from "../../../api/contracts/search.js";
import type { AddSeedArtist, AddSeedSong } from "./AddSeedDialog/types.js";

export type AddSeedDialogState =
  | { readonly _tag: "Prompt" }
  | { readonly _tag: "Searching"; readonly query: string }
  | { readonly _tag: "Empty"; readonly query: string }
  | {
      readonly _tag: "Results";
      readonly query: string;
      readonly artists: readonly AddSeedArtist[];
      readonly songs: readonly AddSeedSong[];
    }
  | { readonly _tag: "LoadError"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export const AddSeedDialogState = {
  fromResult(
    query: string,
    result: AsyncResult.AsyncResult<ApiPandoraSearchResponse, ApiPublicError>,
  ): AddSeedDialogState {
    if (query.length === 0) {
      return { _tag: "Prompt" };
    }
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): AddSeedDialogState => ({ _tag: "Searching", query }),
      onError: (error): AddSeedDialogState => ({ _tag: "LoadError", error }),
      onDefect: (defect): AddSeedDialogState => ({ _tag: "Defect", defect }),
      onSuccess: (success): AddSeedDialogState => {
        const artists = projectArtists(success.value);
        const songs = projectSongs(success.value);
        if (artists.length === 0 && songs.length === 0) {
          return { _tag: "Empty", query };
        }
        return { _tag: "Results", query, artists, songs };
      },
    });
  },
};

function projectArtists(
  response: ApiPandoraSearchResponse,
): readonly AddSeedArtist[] {
  const artists = response.artists ?? [];
  return artists.map((artist) => ({
    musicToken: artist.musicToken,
    artistName: artist.artistName,
  }));
}

function projectSongs(
  response: ApiPandoraSearchResponse,
): readonly AddSeedSong[] {
  const songs = response.songs ?? [];
  return songs.map((song) => ({
    musicToken: song.musicToken,
    songName: song.songName,
    artistName: song.artistName,
  }));
}
