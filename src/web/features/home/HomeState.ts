/**
 * @module HomeState
 *
 * Pure domain ADT for the home page shelves. Each home shelf
 * (playlists, hot albums, discovery, collection, archive) is fed by an
 * independent Effect RPC query atom; this module converts each
 * AsyncResult into a generic {@link HomeShelfState} tagged union so
 * `home-page.tsx` composes state-specific surfaces (skeleton / shelf /
 * error) instead of branching on raw `AsyncResult` fields per shelf.
 *
 * `Ready` carries already-projected `AlbumData`/`PlaylistData` view
 * shapes so JSX never reaches into raw wire payloads. Empty results
 * remain in `Ready` with `items: []` because each shelf renders its own
 * inline empty message (see `AlbumShelf` / `PlaylistShelf`); the
 * skeleton case is reserved for "still loading" rather than "loaded but
 * empty" so the existing user-visible behavior survives the cutover.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiLibraryAlbum } from "../../../api/contracts/library.js";
import type { ApiPlaylist } from "../../../api/contracts/playlist.js";
import type { AlbumData, PlaylistData } from "./types.js";

export type HomeShelfState<T> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly items: readonly T[] }
  | { readonly _tag: "LoadError"; readonly error: ApiPublicError }
  | { readonly _tag: "Defect"; readonly defect: unknown };

export const HomeState = {
  playlistShelfFromResult(
    result: AsyncResult.AsyncResult<readonly ApiPlaylist[], ApiPublicError>,
  ): HomeShelfState<PlaylistData> {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): HomeShelfState<PlaylistData> => ({ _tag: "Loading" }),
      onError: (error): HomeShelfState<PlaylistData> => ({
        _tag: "LoadError",
        error,
      }),
      onDefect: (defect): HomeShelfState<PlaylistData> => ({
        _tag: "Defect",
        defect,
      }),
      onSuccess: (success): HomeShelfState<PlaylistData> => ({
        _tag: "Ready",
        items: success.value.map(toPlaylistData),
      }),
    });
  },
  albumShelfFromResult(
    result: AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], ApiPublicError>,
  ): HomeShelfState<AlbumData> {
    return AsyncResult.matchWithWaiting(result, {
      onWaiting: (): HomeShelfState<AlbumData> => ({ _tag: "Loading" }),
      onError: (error): HomeShelfState<AlbumData> => ({
        _tag: "LoadError",
        error,
      }),
      onDefect: (defect): HomeShelfState<AlbumData> => ({
        _tag: "Defect",
        defect,
      }),
      onSuccess: (success): HomeShelfState<AlbumData> => ({
        _tag: "Ready",
        items: success.value.map(toAlbumData),
      }),
    });
  },
};

function toPlaylistData(playlist: ApiPlaylist): PlaylistData {
  return {
    id: playlist.id,
    name: playlist.name,
    ...(playlist.artworkUrl !== undefined
      ? { artworkUrl: playlist.artworkUrl }
      : {}),
  };
}

function toAlbumData(album: ApiLibraryAlbum): AlbumData {
  return {
    id: album.id,
    title: album.title,
    artist: album.artist,
    year: album.year ?? null,
    artworkUrl: album.artworkUrl ?? null,
    placement: album.placement,
    placementUpdatedAt: album.placementUpdatedAt,
    isHot: album.isHot,
    hotRank: album.hotRank,
  };
}
