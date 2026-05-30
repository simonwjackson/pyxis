/**
 * @module SourceAlbumDetailRoot
 *
 * Source-backed album detail root. Reads `album.withTracks.get` and
 * `library.albumStates.resolve` through the Effect RPC client and adapts
 * both AsyncResults into the pure {@link SourceAlbumDetailState} ADT before
 * rendering. The states query subscribes to {@link LIBRARY_ALBUM_STATES_TAG}
 * so a successful `library.album.save`/`library.albumPlacement.set`
 * refreshes the placement badge in step with the legacy
 * `utils.library.resolveAlbumStates.invalidate()` fan-out.
 *
 * Mutations preserve the legacy invalidation fan-outs through reactivity
 * tags:
 *
 *  - `library.album.save` and `library.albumPlacement.set` publish
 *    {@link LIBRARY_ALBUMS_TAG}, {@link LIBRARY_HOT_ALBUMS_TAG},
 *    {@link LIBRARY_ALBUM_STATES_TAG}, and (when the source maps to a
 *    library album) {@link libraryAlbumTag} so the library detail root
 *    elsewhere refreshes the same way the legacy
 *    `utils.library.album.invalidate()` did.
 */

import {
  LIBRARY_ALBUM_STATES_TAG,
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  libraryAlbumTag,
} from "@app/features/home/libraryReactivityTags";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import {
  type AlbumPlacement,
  formatPlacementLabel,
} from "@app/shared/lib/libraryPlacement";
import {
  type SourceAlbumTrack,
  shuffleArray,
  sourceAlbumTrackToNowPlaying,
  tracksToQueuePayload,
} from "@app/shared/lib/nowPlayingUtils";
import { usePlaybackContext } from "@app/shared/playback/PlaybackContext";
import { PlaybackState } from "@app/shared/playback/types";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { AlbumDetailContent } from "./AlbumDetailContent";
import { AlbumDetailSkeleton } from "./AlbumDetailSkeleton";
import {
  SourceAlbumDetailState,
  SourceAlbumLibraryState,
} from "./AlbumDetailState";
import type { AlbumDetailPageProps } from "./types";

const saveAlbumMutationAtom = PyxisRpcClient.mutation("library.album.save");
const setPlacementMutationAtom = PyxisRpcClient.mutation(
  "library.albumPlacement.set",
);

const baseAlbumWriteKeys = [
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  LIBRARY_ALBUM_STATES_TAG,
] as const;

export function SourceAlbumDetailRoot({
  albumId,
  autoPlay,
  startIndex,
  shuffle,
}: AlbumDetailPageProps) {
  const router = useRouter();
  const playback = usePlaybackContext();
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const sourceQueryAtom = useMemo(
    () => PyxisRpcClient.query("album.withTracks.get", { id: albumId }),
    [albumId],
  );
  const statesQueryAtom = useMemo(
    () =>
      PyxisRpcClient.query(
        "library.albumStates.resolve",
        { sourceIds: [albumId] },
        { reactivityKeys: [LIBRARY_ALBUM_STATES_TAG] as const },
      ),
    [albumId],
  );

  const sourceResult = projectQueryResult(useAtomValue(sourceQueryAtom));
  const statesResult = projectQueryResult(useAtomValue(statesQueryAtom));
  const state = SourceAlbumDetailState.fromResults(sourceResult, statesResult);

  const libraryAlbumIdForWrite =
    state._tag === "Ready"
      ? SourceAlbumLibraryState.albumId(state.libraryState)
      : undefined;

  const albumWriteKeys = useMemo(
    () =>
      libraryAlbumIdForWrite !== undefined
        ? ([
            ...baseAlbumWriteKeys,
            libraryAlbumTag(libraryAlbumIdForWrite),
          ] as const)
        : baseAlbumWriteKeys,
    [libraryAlbumIdForWrite],
  );

  const saveAlbumResult = useAtomValue(saveAlbumMutationAtom);
  const setPlacementResult = useAtomValue(setPlacementMutationAtom);
  const isSavingAlbum = AsyncResult.isWaiting(saveAlbumResult);
  const isSettingPlacement = AsyncResult.isWaiting(setPlacementResult);

  const saveAlbum = useAtomSet(saveAlbumMutationAtom, {
    mode: "promiseExit",
  });
  const setPlacement = useAtomSet(setPlacementMutationAtom, {
    mode: "promiseExit",
  });

  const album = state._tag === "Ready" ? state.album : null;
  const tracks = state._tag === "Ready" ? state.tracks : null;
  const libraryState = state._tag === "Ready" ? state.libraryState : null;
  const currentTrackId = PlaybackState.currentTrack(playback.state)?.trackToken;
  const hasAutoPlayedRef = useRef(false);

  const startPlayback = useCallback(
    (index: number, doShuffle: boolean) => {
      if (!tracks || !album) return;
      const ordered = (tracks as readonly SourceAlbumTrack[]).map((track) =>
        sourceAlbumTrackToNowPlaying(
          track,
          album.title,
          album.artworkUrl ?? null,
        ),
      );
      const nextTracks = doShuffle ? shuffleArray(ordered) : ordered;
      playbackRef.current.playQueue({
        tracks: tracksToQueuePayload(nextTracks),
        context: { type: "album", albumId },
        startIndex: doShuffle ? 0 : index,
      });
    },
    [album, albumId, tracks],
  );

  useEffect(() => {
    if (!autoPlay || hasAutoPlayedRef.current || !tracks || !album) return;
    hasAutoPlayedRef.current = true;
    startPlayback(startIndex ?? 0, shuffle ?? false);
  }, [album, autoPlay, shuffle, startIndex, startPlayback, tracks]);

  const playbackError = PlaybackState.error(playback.state);

  useEffect(() => {
    if (playbackError) {
      toast.error(`Audio error: ${playbackError}`);
      playbackRef.current.clearError();
    }
  }, [playbackError]);

  const handleSaveAlbum = useCallback(() => {
    void saveAlbum({
      payload: { id: albumId },
      reactivityKeys: albumWriteKeys,
    }).then((exit) => {
      if (exit._tag !== "Success") {
        toast.error("Failed to add album");
        return;
      }
      switch (exit.value.outcome) {
        case "created":
          toast.success("album added to discovery");
          break;
        case "restored":
          toast.success("album restored to discovery");
          break;
        case "existing":
          toast.info(
            `album already in ${formatPlacementLabel(
              exit.value.placement,
            ).toLowerCase()}`,
          );
          break;
      }
    });
  }, [albumId, albumWriteKeys, saveAlbum]);

  const handleSetPlacement = useCallback(
    (placement: AlbumPlacement, libraryAlbumId: string) => {
      void setPlacement({
        payload: { albumId: libraryAlbumId, placement },
        reactivityKeys: albumWriteKeys,
      }).then((exit) => {
        if (exit._tag !== "Success") {
          toast.error("Failed to move album");
          return;
        }
        toast.success(
          `moved to ${formatPlacementLabel(exit.value.placement).toLowerCase()}`,
        );
      });
    },
    [albumWriteKeys, setPlacement],
  );

  if (state._tag === "Loading") {
    return <AlbumDetailSkeleton />;
  }

  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
        <p className="text-pyxis-dim">couldn't load album</p>
      </div>
    );
  }

  if (!album || !tracks) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-pyxis-dim">album not found</p>
      </div>
    );
  }

  const linkedLibraryAlbumId = SourceAlbumLibraryState.albumId(libraryState);
  const onSetPlacementCallback =
    linkedLibraryAlbumId !== undefined
      ? (placement: AlbumPlacement) =>
          handleSetPlacement(placement, linkedLibraryAlbumId)
      : undefined;

  return (
    <AlbumDetailContent
      album={album}
      tracks={tracks}
      currentTrackId={currentTrackId ?? undefined}
      currentPlacement={SourceAlbumLibraryState.placement(libraryState)}
      isHot={SourceAlbumLibraryState.isHot(libraryState)}
      canManagePlacement={linkedLibraryAlbumId !== undefined}
      canEditMetadata={false}
      isSavingAlbum={isSavingAlbum}
      isSettingPlacement={isSettingPlacement}
      onBack={() => router.history.back()}
      onPlay={() => startPlayback(0, false)}
      onPlayTrack={(index) => startPlayback(index, false)}
      onSaveAlbum={handleSaveAlbum}
      onSetPlacement={onSetPlacementCallback}
    />
  );
}
