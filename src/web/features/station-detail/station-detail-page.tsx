/**
 * @module StationDetailPage
 * Radio station detail view showing seeds, feedback, and playback controls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AddSeedDialog } from "@/web/features/stations/add-seed-dialog";
import { trpc } from "@/web/shared/lib/trpc";
import {
	radioTrackToNowPlaying,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { StationDetailArtistSeedRow } from "./station-detail-artist-seed-row";
import {
	StationDetailDislikedFeedbackGroup,
	StationDetailFeedbackSection,
	StationDetailLikedFeedbackGroup,
} from "./station-detail-feedback-section";
import { StationDetailFeedbackRow } from "./station-detail-feedback-row";
import { StationDetailHeader } from "./station-detail-header";
import { StationDetailSeedsSection } from "./station-detail-seeds-section";
import { StationDetailSkeleton } from "./station-detail-skeleton";
import { StationDetailSongSeedRow } from "./station-detail-song-seed-row";
import type { StationDetailPageProps } from "./types";

/**
 * Radio station detail page showing seeds, feedback history, and playback controls.
 * Allows managing station seeds and viewing liked/disliked tracks.
 */
export function StationDetailPage({
	token,
	autoPlay,
}: StationDetailPageProps) {
	const [showAddSeed, setShowAddSeed] = useState(false);
	const navigate = useNavigate();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;
	const stationQuery = trpc.radio.getStation.useQuery({ id: token });
	const utils = trpc.useUtils();
	const hasAutoPlayedRef = useRef(false);

	type QueueContext =
		| { readonly type: "radio"; readonly seedId: string }
		| { readonly type: "album"; readonly albumId: string }
		| { readonly type: "playlist"; readonly playlistId: string }
		| { readonly type: "manual" };
	const [queueContext, setQueueContext] = useState<QueueContext>({ type: "manual" });
	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setQueueContext(queueState.context as QueueContext);
		},
	});
	const isThisStationPlaying =
		playback.currentTrack != null &&
		queueContext.type === "radio" &&
		queueContext.seedId === token;

	const radioQuery = trpc.radio.getTracks.useQuery(
		{ id: token, quality: "high" },
		{ enabled: false },
	);

	const startRadioPlayback = useCallback(() => {
		radioQuery.refetch().then((result) => {
			if (!result.data) return;
			const newTracks = result.data.map(radioTrackToNowPlaying);
			playbackRef.current.playQueue({
				tracks: tracksToQueuePayload(newTracks),
				context: { type: "radio", seedId: token },
				startIndex: 0,
			});
		});
	}, [radioQuery, token]);

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

	const removeSeedMutation = trpc.radio.removeSeed.useMutation({
		onSuccess() {
			utils.radio.getStation.invalidate({ id: token });
			toast.success("seed removed");
		},
		onError(error) {
			toast.error(`Failed to remove seed: ${error.message}`);
		},
	});

	const handleRemoveSeed = (seedId: string) => {
		removeSeedMutation.mutate({ radioId: token, seedId });
	};

	if (stationQuery.isLoading) {
		return <StationDetailSkeleton />;
	}

	if (stationQuery.error) {
		return (
			<div className="flex-1 px-4 sm:px-8 py-10">
				<p className="text-[var(--color-error)]">
					Failed to load station details: {stationQuery.error.message}
				</p>
			</div>
		);
	}

	const station = stationQuery.data;
	if (!station) {
		return (
			<div className="flex-1 px-4 sm:px-8 py-10">
				<p className="text-[var(--color-text-dim)]">station not found.</p>
			</div>
		);
	}

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
							<p className="text-xs text-[var(--color-text-dim)] mb-1">Artists</p>
							{artistSeeds.map((seed) => (
								<StationDetailArtistSeedRow
									key={seed.seedId}
									seed={seed}
									isRemoving={removeSeedMutation.isPending}
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
									isRemoving={removeSeedMutation.isPending}
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
