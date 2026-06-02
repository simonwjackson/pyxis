/**
 * @module SearchPage
 * Unified search page for discovering music across all sources.
 *
 * Reads `search.unified` and `library.albumStates.resolve` through the
 * Effect RPC client and adapts both AsyncResults into the pure
 * {@link SearchState} ADT. The states query subscribes to
 * {@link LIBRARY_ALBUM_STATES_TAG} so a successful `library.album.save`
 * refreshes the discovery/collection placement badge in the search
 * results, mirroring the legacy `utils.library.resolveAlbumStates.invalidate()`
 * fan-out.
 *
 * Mutations preserve the legacy invalidation fan-outs through reactivity tags:
 *  - `radio.station.create` publishes {@link RADIO_STATIONS_TAG}
 *    (was `utils.radio.list.invalidate()`).
 *  - `library.album.save` publishes {@link LIBRARY_ALBUMS_TAG},
 *    {@link LIBRARY_HOT_ALBUMS_TAG}, and {@link LIBRARY_ALBUM_STATES_TAG}
 *    (was the `utils.library.albums` + `utils.library.hotAlbums` +
 *    `utils.library.resolveAlbumStates` invalidation triple).
 *  - `playlist.radio.create` publishes {@link PLAYLIST_LIST_TAG}
 *    (was `utils.playlist.list.invalidate()`).
 *
 * Play-album uses `album.withTracks.get` as an imperative fetch (the
 * legacy code used `utils.album.getWithTracks.fetch()` in the click
 * handler); modeling it as a mutation atom with `mode: "promiseExit"`
 * matches the existing station-detail "fetch tracks then play" pattern.
 */

import { toastAlbumSaveResult } from "@app/features/home/libraryAlbumToasts";
import {
  LIBRARY_ALBUM_STATES_TAG,
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  PLAYLIST_LIST_TAG,
} from "@app/features/home/libraryReactivityTags";
import { RADIO_STATIONS_TAG } from "@app/features/stations/radioReactivityTags";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import {
  sourceAlbumTrackToNowPlaying,
  tracksToQueuePayload,
} from "@app/shared/lib/nowPlayingUtils";
import { usePlaybackContext } from "@app/shared/playback/PlaybackContext";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SearchEmptyState } from "./components/SearchEmptyState";
import { SearchFailureState } from "./components/SearchFailureState";
import { SearchIdleState } from "./components/SearchIdleState";
import { SearchLoadingState } from "./components/SearchLoadingState";
import { SearchResultsState } from "./components/SearchResultsState";
import { SearchInput } from "./SearchInput";
import { SearchPageProvider } from "./SearchPage.context";
import { SearchState } from "./SearchState";
import type { SearchTrack } from "./types";

const createStationMutationAtom = PyxisRpcClient.mutation(
  "radio.station.create",
);
const createStationReactivityKeys = [RADIO_STATIONS_TAG] as const;

const saveAlbumMutationAtom = PyxisRpcClient.mutation("library.album.save");
const saveAlbumReactivityKeys = [
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  LIBRARY_ALBUM_STATES_TAG,
] as const;

const createPlaylistRadioMutationAtom = PyxisRpcClient.mutation(
  "playlist.radio.create",
);
const createPlaylistRadioReactivityKeys = [PLAYLIST_LIST_TAG] as const;

/**
 * `album.withTracks.get` is used as an imperative "fetch then play"
 * call rather than a continuously rendered read, mirroring the legacy
 * `utils.album.getWithTracks.fetch({ id })`. Modeling it as a mutation
 * atom with `mode: "promiseExit"` matches the existing station-detail
 * pattern for `radio.stationTracks.get`.
 */
const albumWithTracksFetchAtom = PyxisRpcClient.mutation(
  "album.withTracks.get",
);

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);
  const playback = usePlaybackContext();
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const searchQueryAtom = useMemo(
    () => PyxisRpcClient.query("search.unified.run", { query }),
    [query],
  );
  const searchResult = projectQueryResult(useAtomValue(searchQueryAtom));

  // Derive the states query atom directly from the search result so the
  // atom is keyed by the structural identity of the album source ids
  // (`sourceIdsKey`). Computing both the ids and the atom in the same
  // memo keeps the dependency list honest and avoids creating a new
  // `library.albumStates.resolve` atom on every render.
  const sourceIdsKey =
    searchResult._tag === "Success"
      ? searchResult.value.albums.flatMap((album) => album.sourceIds).join("|")
      : "";
  const statesQueryAtom = useMemo(() => {
    const sourceIds = sourceIdsKey.length > 0 ? sourceIdsKey.split("|") : [];
    return PyxisRpcClient.query(
      "library.albumStates.resolve",
      { sourceIds },
      { reactivityKeys: [LIBRARY_ALBUM_STATES_TAG] as const },
    );
  }, [sourceIdsKey]);
  const statesResult = projectQueryResult(useAtomValue(statesQueryAtom));

  const state = SearchState.fromResults(query, searchResult, statesResult);

  const createStation = useAtomSet(createStationMutationAtom, {
    mode: "promiseExit",
  });
  const saveAlbum = useAtomSet(saveAlbumMutationAtom, {
    mode: "promiseExit",
  });
  const createPlaylistRadio = useAtomSet(createPlaylistRadioMutationAtom, {
    mode: "promiseExit",
  });
  const fetchAlbumWithTracks = useAtomSet(albumWithTracksFetchAtom, {
    mode: "promiseExit",
  });

  const handleSearch = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  const handleCreateStation = useCallback(
    (musicToken: string) => {
      void createStation({
        payload: { musicToken },
        reactivityKeys: createStationReactivityKeys,
      }).then((exit) => {
        if (exit._tag === "Success") {
          toast.success("station created");
        } else {
          toast.error("Failed to create station");
        }
      });
    },
    [createStation],
  );

  const handleSaveAlbum = useCallback(
    (albumId: string) => {
      void saveAlbum({
        payload: { id: albumId },
        reactivityKeys: saveAlbumReactivityKeys,
      }).then((exit) => {
        if (exit._tag === "Success") {
          toastAlbumSaveResult(exit.value);
        } else {
          toast.error("Failed to add album");
        }
      });
    },
    [saveAlbum],
  );

  const handlePlayAlbum = useCallback(
    (albumId: string) => {
      if (playingAlbumId) return;
      setPlayingAlbumId(albumId);
      void fetchAlbumWithTracks({ payload: { id: albumId } })
        .then((exit) => {
          if (exit._tag !== "Success") {
            toast.error("failed to load album");
            return;
          }
          const data = exit.value;
          const ordered = data.tracks.map((track) =>
            sourceAlbumTrackToNowPlaying(
              track,
              data.album.title,
              data.album.artworkUrl ?? null,
            ),
          );
          playbackRef.current.playQueue({
            tracks: tracksToQueuePayload(ordered),
            context: { type: "album", albumId },
            startIndex: 0,
          });
        })
        .finally(() => {
          setPlayingAlbumId(null);
        });
    },
    [fetchAlbumWithTracks, playingAlbumId],
  );

  const handleStartRadio = useCallback(
    (track: SearchTrack) => {
      void createPlaylistRadio({
        payload: {
          trackId: track.id,
          name: `${track.title} Radio`,
          ...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
        },
        reactivityKeys: createPlaylistRadioReactivityKeys,
      }).then((exit) => {
        if (exit._tag === "Success") {
          toast.success("radio created");
        } else {
          toast.error("Failed to create radio");
        }
      });
    },
    [createPlaylistRadio],
  );

  return (
    <div className="page-frame lattice-container space-y-6">
      <h2 className="zune-display zune-page-title text-pyxis-text mb-4">
        search
      </h2>
      <SearchInput
        onSearch={handleSearch}
        placeholder="search artists, songs, albums..."
      />
      <SearchPageProvider
        value={{
          state,
          playingAlbumId,
          playAlbum: handlePlayAlbum,
          saveAlbum: handleSaveAlbum,
          startRadio: handleStartRadio,
          createStation: handleCreateStation,
        }}
      >
        <SearchIdleState />
        <SearchLoadingState />
        <SearchEmptyState />
        <SearchFailureState />
        <SearchResultsState />
      </SearchPageProvider>
    </div>
  );
}
