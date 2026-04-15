/**
 * @module NowPlayingBar
 * Zune-inspired playback bar — distilled controls with contextual action sheet.
 * Mobile: only play/pause + skip visible; track summary opens the action sheet.
 * Desktop: transport + compact more menu replaces the dense icon toolbar.
 */

import { useCallback, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { TrackInfoModal } from "../track-info-modal";
import { formatTime } from "../lib/now-playing-utils";
import { trpc } from "../lib/trpc";
import { usePlaybackContext } from "../playback/playback-context";
import type { PlaybackQueueContext } from "../playback/types";
import { NowPlayingActionItem } from "./now-playing-bar/components/NowPlayingActionItem";
import { NowPlayingActionSheet } from "./now-playing-bar/components/NowPlayingActionSheet";
import { NowPlayingArtwork } from "./now-playing-bar/components/NowPlayingArtwork";
import { NowPlayingDesktopBar } from "./now-playing-bar/components/NowPlayingDesktopBar";
import { NowPlayingDesktopTransport } from "./now-playing-bar/components/NowPlayingDesktopTransport";
import { NowPlayingMobileBar } from "./now-playing-bar/components/NowPlayingMobileBar";
import { NowPlayingMobileTransport } from "./now-playing-bar/components/NowPlayingMobileTransport";
import { NowPlayingProgressBar } from "./now-playing-bar/components/NowPlayingProgressBar";
import { NowPlayingSecondaryActions } from "./now-playing-bar/components/NowPlayingSecondaryActions";
import { NowPlayingTrackSummary } from "./now-playing-bar/components/NowPlayingTrackSummary";

function isPandoraTrack(trackToken: string): boolean {
	return trackToken.startsWith("pandora:");
}

function navigateToContext(
	navigate: ReturnType<typeof useNavigate>,
	context: PlaybackQueueContext,
) {
	switch (context.type) {
		case "album":
			navigate({
				to: "/album/$albumId",
				params: { albumId: context.albumId },
				search: {
					play: undefined,
					startIndex: undefined,
					shuffle: undefined,
				},
			});
			break;
		case "playlist":
			navigate({
				to: "/playlist/$playlistId",
				params: { playlistId: context.playlistId },
				search: {
					play: undefined,
					startIndex: undefined,
					shuffle: undefined,
				},
			});
			break;
		case "radio":
			navigate({
				to: "/station/$token",
				params: { token: context.seedId },
				search: { play: undefined },
			});
			break;
		case "manual":
			navigate({
				to: "/",
				search: {
					pl_sort: undefined,
					pl_page: undefined,
					al_sort: undefined,
					al_page: undefined,
				},
			});
			break;
	}
}

export function NowPlayingBar() {
	const playback = usePlaybackContext();
	const {
		currentTrack,
		isPlaying,
		progress,
		duration,
		togglePlayPause,
		triggerSkip,
		triggerPrevious,
		seek,
	} = playback;
	const navigate = useNavigate();
	const [queueContext, setQueueContext] = useState<PlaybackQueueContext>({
		type: "manual",
	});
	const [queueIndex, setQueueIndex] = useState(0);
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const [showActionSheet, setShowActionSheet] = useState(false);
	const progressBarRef = useRef<HTMLDivElement>(null);

	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setQueueContext(queueState.context as PlaybackQueueContext);
			setQueueIndex(queueState.currentIndex);
		},
	});

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_, variables) {
			toast.success(variables.positive ? "liked" : "disliked");
		},
		onError(error) {
			toast.error(`feedback failed: ${error.message}`);
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("track will be skipped for 30 days");
		},
		onError(error) {
			toast.error(`sleep failed: ${error.message}`);
		},
	});
	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("song bookmarked");
		},
		onError(error) {
			toast.error(`bookmark failed: ${error.message}`);
		},
	});

	const handleSeek = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!progressBarRef.current || duration <= 0) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const fraction = Math.max(
				0,
				Math.min(1, (event.clientX - rect.left) / rect.width),
			);
			seek(fraction * duration);
		},
		[duration, seek],
	);

	const handleSeekStep = useCallback(
		(delta: number) => {
			seek(Math.max(0, Math.min(duration, progress + delta)));
		},
		[duration, progress, seek],
	);

	const handleLike = useCallback(() => {
		if (!currentTrack || queueContext.type !== "radio") return;
		feedbackMutation.mutate({
			radioId: queueContext.seedId,
			id: currentTrack.trackToken,
			positive: true,
		});
	}, [currentTrack, queueContext, feedbackMutation]);

	const handleDislike = useCallback(() => {
		if (!currentTrack || queueContext.type !== "radio") return;
		feedbackMutation.mutate({
			radioId: queueContext.seedId,
			id: currentTrack.trackToken,
			positive: false,
		});
		triggerSkip();
	}, [currentTrack, queueContext, feedbackMutation, triggerSkip]);

	const handleBookmark = useCallback(() => {
		if (!currentTrack) return;
		bookmarkSongMutation.mutate({
			id: currentTrack.trackToken,
			type: "song",
		});
	}, [currentTrack, bookmarkSongMutation]);

	const handleSleep = useCallback(() => {
		if (!currentTrack) return;
		sleepMutation.mutate({ id: currentTrack.trackToken });
		triggerSkip();
	}, [currentTrack, sleepMutation, triggerSkip]);

	const handleGoToContext = useCallback(() => {
		navigateToContext(navigate, queueContext);
	}, [navigate, queueContext]);

	const closeActionSheet = useCallback(() => {
		setShowActionSheet(false);
	}, []);

	const openTrackInfo = useCallback(() => {
		setShowActionSheet(false);
		setShowTrackInfo(true);
	}, []);

	if (!currentTrack) return null;

	const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
	const hasPandoraCapabilities = isPandoraTrack(currentTrack.trackToken);
	const isAtQueueStart = queueIndex === 0;
	const progressValueText = `${formatTime(progress)} of ${formatTime(duration)}`;

	return (
		<>
			<div
				className="fixed bottom-0 left-0 right-0 border-t border-[var(--color-border)] safe-bottom"
				style={{ backgroundColor: "var(--color-bg-panel)", zIndex: 40 }}
				role="region"
				aria-label="Now playing"
			>
				<NowPlayingProgressBar
					progressBarRef={progressBarRef}
					progress={progress}
					duration={duration}
					progressPercent={progressPercent}
					onSeek={handleSeek}
					onSeekStep={handleSeekStep}
					valueText={progressValueText}
				/>

				<NowPlayingDesktopBar>
					<NowPlayingArtwork
						track={currentTrack}
						sizeClassName="w-14 h-14"
						iconClassName="w-5 h-5 text-[var(--color-text-dim)]"
					/>
					<NowPlayingTrackSummary
						track={currentTrack}
						layout="desktop"
						onClick={handleGoToContext}
					/>
					<span className="zune-data text-xs text-[var(--color-text-dim)] shrink-0 tabular-nums">
						{formatTime(progress)} / {formatTime(duration)}
					</span>
					<NowPlayingDesktopTransport
						isPlaying={isPlaying}
						isAtQueueStart={isAtQueueStart}
						onPrevious={triggerPrevious}
						onTogglePlayPause={togglePlayPause}
						onSkip={triggerSkip}
					/>
					<NowPlayingSecondaryActions>
						{hasPandoraCapabilities ? (
							<button
								onClick={() => setShowActionSheet(true)}
								className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
								type="button"
								aria-label="More actions"
								title="More actions"
							>
								<MoreHorizontal className="w-4 h-4" />
							</button>
						) : null}
					</NowPlayingSecondaryActions>
				</NowPlayingDesktopBar>

				<NowPlayingMobileBar>
					<NowPlayingArtwork
						track={currentTrack}
						sizeClassName="w-11 h-11"
						iconClassName="w-5 h-5 text-[var(--color-text-dim)]"
					/>
					<NowPlayingTrackSummary
						track={currentTrack}
						layout="mobile"
						onClick={() => setShowActionSheet(true)}
					/>
					<NowPlayingMobileTransport
						isPlaying={isPlaying}
						onTogglePlayPause={togglePlayPause}
						onSkip={triggerSkip}
					/>
				</NowPlayingMobileBar>
			</div>

			{showActionSheet ? (
				<NowPlayingActionSheet
					onClose={closeActionSheet}
					track={currentTrack}
					progress={progress}
					duration={duration}
				>
					<NowPlayingActionItem
						onClick={() => {
							handleGoToContext();
							closeActionSheet();
						}}
						divider="bottom"
					>
						go to source
					</NowPlayingActionItem>

					{hasPandoraCapabilities && queueContext.type === "radio" ? (
						<>
							<NowPlayingActionItem
								onClick={() => {
									handleLike();
									closeActionSheet();
								}}
								tone="liked"
								divider="bottom"
							>
								like
							</NowPlayingActionItem>
							<NowPlayingActionItem
								onClick={() => {
									handleDislike();
									closeActionSheet();
								}}
								tone="disliked"
								divider="bottom"
							>
								dislike
							</NowPlayingActionItem>
						</>
					) : null}

					{hasPandoraCapabilities ? (
						<>
							<NowPlayingActionItem
								onClick={() => {
									handleBookmark();
									closeActionSheet();
								}}
								divider="bottom"
							>
								bookmark
							</NowPlayingActionItem>
							<NowPlayingActionItem
								onClick={() => {
									handleSleep();
									closeActionSheet();
								}}
								divider="bottom"
							>
								sleep 30 days
							</NowPlayingActionItem>
							<NowPlayingActionItem onClick={openTrackInfo}>
								track info
							</NowPlayingActionItem>
						</>
					) : null}
				</NowPlayingActionSheet>
			) : null}

			{showTrackInfo && hasPandoraCapabilities ? (
				<TrackInfoModal
					trackId={currentTrack.trackToken}
					songName={currentTrack.songName}
					artistName={currentTrack.artistName}
					albumName={currentTrack.albumName}
					albumArtUrl={currentTrack.artUrl}
					duration={duration}
					onClose={() => setShowTrackInfo(false)}
				/>
			) : null}
		</>
	);
}
