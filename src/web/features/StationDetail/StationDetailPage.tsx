/**
 * @module StationDetailPage
 * Radio station detail view showing seeds, feedback, and playback controls.
 *
 * Reads `radio.station.get` through the Effect RPC client and adapts the
 * AsyncResult into the pure {@link StationDetailState} ADT. The query atom
 * is bound to the per-station {@link radioStationTag} reactivity tag so the
 * add-seed mutation in {@link AddSeedDialog} and the local
 * `radio.seed.remove` mutation refresh the detail in step with their
 * legacy React Query invalidation.
 *
 * Realtime queue context comes from {@link queueStateStreamAtom} (a
 * `queue.state.stream` subscription) — the page only needs the latest
 * `context` to decide whether the header's Play button is hidden because
 * this station is already playing.
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddSeedDialog } from "@app/features/stations/AddSeedDialog";
import { radioStationTag } from "@app/features/stations/radioReactivityTags";
import { StationCommandState } from "@app/features/stations/StationCommandState";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import {
  radioTrackToNowPlaying,
  tracksToQueuePayload,
} from "@app/shared/lib/nowPlayingUtils";
import { usePlaybackContext } from "@app/shared/playback/PlaybackContext";
import { queueStateStreamAtom } from "@app/shared/playback/queueStateStreamAtom";
import { StationDetailState } from "./StationDetailState";
import { StationDetailArtistSeedRow } from "./StationDetailArtistSeedRow";
import { StationDetailFeedbackRow } from "./StationDetailFeedbackRow";
import {
  StationDetailDislikedFeedbackGroup,
  StationDetailFeedbackSection,
  StationDetailLikedFeedbackGroup,
} from "./StationDetailFeedbackSection";
import { StationDetailHeader } from "./StationDetailHeader";
import { StationDetailSeedsSection } from "./StationDetailSeedsSection";
import { StationDetailSkeleton } from "./StationDetailSkeleton";
import { StationDetailSongSeedRow } from "./StationDetailSongSeedRow";
import type { StationDetailPageProps } from "./types";

/**
 * Mutation atom for `radio.seed.remove`. Publishes the per-station
 * reactivity tag in {@link handleRemoveSeed} so the detail query atom
 * refetches (mirroring the legacy `utils.radio.getStation.invalidate({ id
 * })`).
 */
const removeSeedMutationAtom = PyxisRpcClient.mutation("radio.seed.remove");

/**
 * `radio.stationTracks.get` is used as an imperative fetch ("start
 * playback now") rather than a continuously rendered read. Modeling it as
 * a mutation atom matches the legacy `useQuery({ enabled: false }) +
 * refetch()` pattern: the page calls `useAtomSet(... { promiseExit })`
 * once when the user (or auto-play) triggers playback, awaits the exit,
 * and hands the tracks to the playback context.
 */
const stationTracksMutationAtom = PyxisRpcClient.mutation(
  "radio.stationTracks.get",
);

/**
 * Radio station detail page showing seeds, feedback history, and playback controls.
 * Allows managing station seeds and viewing liked/disliked tracks.
 */
export function StationDetailPage({ token, autoPlay }: StationDetailPageProps) {
  const [showAddSeed, setShowAddSeed] = useState(false);
  const navigate = useNavigate();
  const playback = usePlaybackContext();
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const hasAutoPlayedRef = useRef(false);

  const stationQueryAtom = useMemo(
    () =>
      PyxisRpcClient.query(
        "radio.station.get",
        { id: token },
        { reactivityKeys: [radioStationTag(token)] },
      ),
    [token],
  );
  const stationResult = projectQueryResult(useAtomValue(stationQueryAtom));
  const state = StationDetailState.fromResult(stationResult);

  const queueResult = useAtomValue(queueStateStreamAtom);
  const queueContext = AsyncResult.isSuccess(queueResult)
    ? queueResult.value.context
    : null;
  const isThisStationPlaying =
    playback.currentTrack != null &&
    queueContext?.type === "radio" &&
    queueContext.seedId === token;

  const fetchTracks = useAtomSet(stationTracksMutationAtom, {
    mode: "promiseExit",
  });

  const startRadioPlayback = useCallback(() => {
    void fetchTracks({ payload: { id: token, quality: "high" } }).then(
      (exit) => {
        if (exit._tag !== "Success") return;
        const newTracks = exit.value.map(radioTrackToNowPlaying);
        playbackRef.current.playQueue({
          tracks: tracksToQueuePayload(newTracks),
          context: { type: "radio", seedId: token },
          startIndex: 0,
        });
      },
    );
  }, [fetchTracks, token]);

  useEffect(() => {
    if (!autoPlay || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    startRadioPlayback();
  }, [autoPlay, startRadioPlayback]);

  useEffect(() => {
    if (playback.error) {
      toast.error(`Audio error: ${playback.error}`);
      playbackRef.current.clearError();
    }
  }, [playback.error]);

  const removeSeedResult = projectQueryResult(
    useAtomValue(removeSeedMutationAtom),
  );
  const removeSeedState = StationCommandState.fromResult(removeSeedResult);
  const isRemovingSeed = StationCommandState.isSubmitting(removeSeedState);
  const removeSeed = useAtomSet(removeSeedMutationAtom, {
    mode: "promiseExit",
  });

  const handleRemoveSeed = (seedId: string) => {
    void removeSeed({
      payload: { radioId: token, seedId },
      reactivityKeys: [radioStationTag(token)],
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("seed removed");
      } else {
        toast.error("Failed to remove seed");
      }
    });
  };

  if (state._tag === "Loading") {
    return <StationDetailSkeleton />;
  }

  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="flex-1 px-4 sm:px-8 py-10">
        <p className="text-[var(--color-error)]">
          Failed to load station details
        </p>
      </div>
    );
  }

  if (state._tag === "NotFound") {
    return (
      <div className="flex-1 px-4 sm:px-8 py-10">
        <p className="text-[var(--color-text-dim)]">station not found.</p>
      </div>
    );
  }

  const station = state.station;
  const artistSeeds = station.music?.artists ?? [];
  const songSeeds = station.music?.songs ?? [];
  const thumbsUp = station.feedback?.thumbsUp ?? [];
  const thumbsDown = station.feedback?.thumbsDown ?? [];
  const hasSeeds = artistSeeds.length > 0 || songSeeds.length > 0;
  const hasFeedback = thumbsUp.length > 0 || thumbsDown.length > 0;

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-8 max-w-3xl mx-auto">
      <StationDetailHeader
        stationName={station.name}
        isPlaying={isThisStationPlaying}
        onBack={() =>
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
        onPlay={startRadioPlayback}
        onAddSeed={() => setShowAddSeed(true)}
      />

      <StationDetailSeedsSection
        hasSeeds={hasSeeds}
        artistSeeds={
          artistSeeds.length > 0 ? (
            <div className="space-y-1 mb-4">
              <p className="text-xs text-[var(--color-text-dim)] mb-1">
                Artists
              </p>
              {artistSeeds.map((seed) => (
                <StationDetailArtistSeedRow
                  key={seed.seedId}
                  seed={seed}
                  isRemoving={isRemovingSeed}
                  onRemove={handleRemoveSeed}
                />
              ))}
            </div>
          ) : null
        }
        songSeeds={
          songSeeds.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-[var(--color-text-dim)] mb-1">Songs</p>
              {songSeeds.map((seed) => (
                <StationDetailSongSeedRow
                  key={seed.seedId}
                  seed={seed}
                  isRemoving={isRemovingSeed}
                  onRemove={handleRemoveSeed}
                />
              ))}
            </div>
          ) : null
        }
      />

      <StationDetailFeedbackSection
        hasFeedback={hasFeedback}
        likedFeedback={
          thumbsUp.length > 0 ? (
            <StationDetailLikedFeedbackGroup>
              {thumbsUp.map((feedback) => (
                <StationDetailFeedbackRow
                  key={feedback.feedbackId}
                  feedback={feedback}
                />
              ))}
            </StationDetailLikedFeedbackGroup>
          ) : null
        }
        dislikedFeedback={
          thumbsDown.length > 0 ? (
            <StationDetailDislikedFeedbackGroup>
              {thumbsDown.map((feedback) => (
                <StationDetailFeedbackRow
                  key={feedback.feedbackId}
                  feedback={feedback}
                />
              ))}
            </StationDetailDislikedFeedbackGroup>
          ) : null
        }
      />

      {showAddSeed ? (
        <AddSeedDialog radioId={token} onClose={() => setShowAddSeed(false)} />
      ) : null}
    </div>
  );
}
