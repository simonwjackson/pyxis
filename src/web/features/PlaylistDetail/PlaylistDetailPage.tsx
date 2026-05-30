/**
 * @module PlaylistDetailPage
 * Playlist detail view showing track listing with play and shuffle controls.
 */

import { PLAYLIST_LIST_TAG } from "@app/features/home/libraryReactivityTags";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import {
  formatTime,
  playlistTrackToNowPlaying,
  shuffleArray,
  tracksToQueuePayload,
} from "@app/shared/lib/nowPlayingUtils";
import { usePlaybackContext } from "@app/shared/playback/PlaybackContext";
import { PlaybackState } from "@app/shared/playback/types";
import { Button } from "@app/shared/ui/Button";
import { Skeleton } from "@app/shared/ui/Skeleton";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Music, Play, Shuffle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { PlaylistDetailState } from "./PlaylistDetailState";

/**
 * Formats total duration as human-readable string.
 * @param totalSeconds - Duration in seconds
 * @returns Formatted string (e.g., "1 hr 23 min" or "45 min")
 */
const PLAYLIST_DETAIL_SKELETON_ROWS = Array.from(
  { length: 8 },
  (_, index) => `playlist-detail-skeleton-${index}`,
);

function formatTotalDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${String(hours)} hr ${String(mins)} min`;
  }
  return `${String(mins)} min`;
}

/**
 * Props for the PlaylistDetailPage component.
 */
type PlaylistDetailPageProps = {
  /** Playlist ID to display */
  readonly playlistId: string;
  /** Whether to auto-play on mount */
  readonly autoPlay?: boolean;
  /** Track index to start playback from */
  readonly startIndex?: number;
  /** Whether to shuffle tracks on play */
  readonly shuffle?: boolean;
};

/**
 * Playlist detail page showing artwork, metadata, and track listing.
 * Supports play, shuffle, and clicking individual tracks to start playback.
 *
 * @param props - Playlist detail page props
 */
export function PlaylistDetailPage({
  playlistId,
  autoPlay,
  startIndex,
  shuffle,
}: PlaylistDetailPageProps) {
  const navigate = useNavigate();
  const playback = usePlaybackContext();
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const playlistsQueryAtom = useMemo(
    () =>
      PyxisRpcClient.query("library.playlists.list", undefined, {
        reactivityKeys: [PLAYLIST_LIST_TAG] as const,
      }),
    [],
  );
  const tracksQueryAtom = useMemo(
    () => PyxisRpcClient.query("playlist.tracks.list", { id: playlistId }),
    [playlistId],
  );

  const playlistsResult = projectQueryResult(useAtomValue(playlistsQueryAtom));
  const tracksResult = projectQueryResult(useAtomValue(tracksQueryAtom));
  const state = PlaylistDetailState.fromResults(
    playlistId,
    playlistsResult,
    tracksResult,
  );
  const playlist = state._tag === "Ready" ? state.playlist : null;
  const tracks = state._tag === "Ready" ? state.tracks : null;

  const hasAutoPlayedRef = useRef(false);

  const currentTrackId = PlaybackState.currentTrack(playback.state)?.trackToken;

  const startPlayback = useCallback(
    (idx: number, doShuffle: boolean) => {
      if (!tracks) return;
      const ordered = tracks.map(playlistTrackToNowPlaying);
      const newTracks = doShuffle ? shuffleArray(ordered) : ordered;
      const startIdx = doShuffle ? 0 : idx;
      playbackRef.current.playQueue({
        tracks: tracksToQueuePayload(newTracks),
        context: { type: "playlist", playlistId },
        startIndex: startIdx,
      });
    },
    [tracks, playlistId],
  );

  // Auto-play on mount if search params request it
  useEffect(() => {
    if (!autoPlay || hasAutoPlayedRef.current || !tracks) return;
    hasAutoPlayedRef.current = true;
    startPlayback(startIndex ?? 0, shuffle ?? false);
  }, [autoPlay, tracks, startIndex, shuffle, startPlayback]);

  const handlePlay = (idx = 0) => {
    startPlayback(idx, false);
  };

  const handleShuffle = () => {
    startPlayback(0, true);
  };

  const playbackError = PlaybackState.error(playback.state);

  useEffect(() => {
    if (playbackError) {
      toast.error(`Audio error: ${playbackError}`);
      playbackRef.current.clearError();
    }
  }, [playbackError]);

  if (state._tag === "Loading") {
    return <PlaylistDetailSkeleton />;
  }

  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-pyxis-error">Failed to load playlist</p>
      </div>
    );
  }

  if (state._tag === "NotFound" || !playlist) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-pyxis-dim">playlist not found</p>
      </div>
    );
  }

  const totalDuration =
    tracks?.reduce((sum, t) => sum + (t.duration ?? 0), 0) ?? 0;
  const trackCount = tracks?.length ?? 0;

  return (
    <div className="page-frame lattice-container max-w-3xl mx-auto space-y-8">
      <button
        type="button"
        onClick={() =>
          navigate({
            to: "/",
            search: {
              pl_sort: undefined,
              pl_page: undefined,
              al_sort: undefined,
              al_page: undefined,
            },
          })
        }
        className="flex items-center gap-1.5 text-sm text-pyxis-dim hover:text-pyxis-text transition-colors"
        aria-label="Back to home"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back
      </button>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-end">
        <div className="w-40 h-40 sm:w-56 sm:h-56 shrink-0 shadow-lg overflow-hidden bg-pyxis-highlight">
          {playlist.artworkUrl ? (
            <img
              src={playlist.artworkUrl}
              alt={playlist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-16 h-16 text-pyxis-dim" />
            </div>
          )}
        </div>
        <div className="space-y-1 min-w-0 text-center sm:text-left">
          <h1 className="zune-heading text-3xl md:text-4xl text-pyxis-text">
            {playlist.name}
          </h1>
          <p className="text-sm text-pyxis-dim">
            {String(trackCount)} track{trackCount !== 1 ? "s" : ""}
            {totalDuration > 0
              ? ` \u00B7 ${formatTotalDuration(totalDuration)}`
              : ""}
          </p>
          <div className="flex gap-2 sm:gap-3 pt-3 flex-wrap justify-center sm:justify-start">
            <Button
              onClick={() => handlePlay(0)}
              className="gap-2bg-pyxis-primary hover:brightness-110 text-pyxis-bg"
            >
              <Play className="w-4 h-4" fill="currentColor" />
              Play
            </Button>
            <Button variant="outline" onClick={handleShuffle} className="gap-2">
              <Shuffle className="w-4 h-4" />
              Shuffle
            </Button>
          </div>
        </div>
      </div>

      {tracks && tracks.length > 0 && (
        <div className="space-y-0.5">
          {tracks.map((track, index) => {
            const isActive = currentTrackId === track.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => handlePlay(index)}
                className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-pyxis-primary/10 text-pyxis-primary font-medium"
                    : "text-pyxis-dim hover:text-pyxis-text hover:bg-pyxis-highlight"
                }`}
              >
                <span className="w-6 text-right text-sm">
                  {String(index + 1)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate block">{track.title}</span>
                  <span className="text-xs text-pyxis-dim truncate block">
                    {track.artist}
                  </span>
                </div>
                {track.duration != null && (
                  <span className="text-xs">{formatTime(track.duration)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the playlist detail page.
 */
function PlaylistDetailSkeleton() {
  return (
    <div className="page-frame lattice-container max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-5 w-16" />
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-end">
        <Skeleton className="w-40 h-40 sm:w-56 sm:h-56 shrink-0" />
        <div className="space-y-2 flex-1 flex flex-col items-center sm:items-start">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2 sm:gap-3 pt-3 justify-center sm:justify-start">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {PLAYLIST_DETAIL_SKELETON_ROWS.map((rowKey) => (
          <div key={rowKey} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="w-6 h-4" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-10 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
