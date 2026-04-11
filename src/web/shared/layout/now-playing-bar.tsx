/**
 * @module NowPlayingBar
 * Zune-inspired playback bar — distilled controls with contextual action sheet.
 * Mobile: only play/pause + skip visible; "more" opens a text-based action sheet.
 * Desktop: transport + compact "more" menu replaces icon toolbar.
 */

import { useState, useRef, useCallback } from "react";
import {
	Play,
	Pause,
	SkipForward,
	SkipBack,
	Music,
	MoreHorizontal,
	X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { usePlaybackContext } from "../playback/playback-context";
import { trpc } from "../lib/trpc";
import { formatTime } from "../lib/now-playing-utils";
import { TrackInfoModal } from "../track-info-modal";
import { SonosSpeakerPicker } from "./sonos-speaker-picker";

type QueueContext =
	| { readonly type: "radio"; readonly seedId: string }
	| { readonly type: "album"; readonly albumId: string }
	| { readonly type: "playlist"; readonly playlistId: string }
	| { readonly type: "manual" };

function isPandoraTrack(trackToken: string): boolean {
	return trackToken.startsWith("pandora:");
}

function navigateToContext(
	navigate: ReturnType<typeof useNavigate>,
	context: QueueContext,
) {
	switch (context.type) {
		case "album":
			navigate({
				to: "/album/$albumId",
				params: { albumId: context.albumId },
				search: { play: undefined, startIndex: undefined, shuffle: undefined },
			});
			break;
		case "playlist":
			navigate({
				to: "/playlist/$playlistId",
				params: { playlistId: context.playlistId },
				search: { play: undefined, startIndex: undefined, shuffle: undefined },
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
				search: { pl_sort: undefined, pl_page: undefined, al_sort: undefined, al_page: undefined },
			});
			break;
	}
}

/**
 * Zune-style action sheet — slides up from bottom with text-labeled actions.
 * Replaces the dense icon toolbar on both mobile and desktop.
 */
function ActionSheet({
	onClose,
	onLike,
	onDislike,
	onBookmark,
	onSleep,
	onTrackInfo,
	onGoToContext,
	isRadioContext,
	hasPandora,
	currentTrack,
	progress,
	duration,
}: {
	readonly onClose: () => void;
	readonly onLike: () => void;
	readonly onDislike: () => void;
	readonly onBookmark: () => void;
	readonly onSleep: () => void;
	readonly onTrackInfo: () => void;
	readonly onGoToContext: () => void;
	readonly isRadioContext: boolean;
	readonly hasPandora: boolean;
	readonly currentTrack: {
		readonly songName: string;
		readonly artistName: string;
		readonly albumName: string;
		readonly artUrl?: string;
		readonly trackToken: string;
	};
	readonly progress: number;
	readonly duration: number;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center"
			onClick={onClose}
			onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
			role="dialog"
			aria-modal="true"
			aria-label="Track actions"
		>
			<div className="fixed inset-0 bg-black/50 action-sheet-backdrop" aria-hidden="true" />
			<div
				className="relative w-full max-w-lg bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] safe-bottom action-sheet-content"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Track hero */}
				<div className="flex items-center gap-4 px-6 pt-6 pb-4">
					{currentTrack.artUrl ? (
						<img
							src={currentTrack.artUrl}
							alt=""
							className="w-16 h-16 shrink-0 object-cover"
						/>
					) : (
						<div className="w-16 h-16 shrink-0 bg-[var(--color-bg-highlight)] flex items-center justify-center">
							<Music className="w-6 h-6 text-[var(--color-text-dim)]" />
						</div>
					)}
					<div className="flex-1 min-w-0">
						<p className="zune-title text-[var(--color-text)] truncate">
							{currentTrack.songName}
						</p>
						<p className="text-sm font-light text-[var(--color-text-muted)] truncate">
							{currentTrack.artistName} — {currentTrack.albumName}
						</p>
						<p className="zune-data text-xs text-[var(--color-text-dim)] mt-1">
							{formatTime(progress)} / {formatTime(duration)}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Text-based action list — Zune style */}
				<nav className="px-6 pb-6 space-y-0.5">
					<button
						type="button"
						onClick={() => { onGoToContext(); onClose(); }}
						className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors zune-heading text-lg border-b border-[var(--color-border)]"
					>
						go to source
					</button>

					{hasPandora && isRadioContext && (
						<>
							<button
								type="button"
								onClick={() => { onLike(); onClose(); }}
								className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-liked)] transition-colors zune-heading text-lg border-b border-[var(--color-border)]"
							>
								like
							</button>
							<button
								type="button"
								onClick={() => { onDislike(); onClose(); }}
								className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-disliked)] transition-colors zune-heading text-lg border-b border-[var(--color-border)]"
							>
								dislike
							</button>
						</>
					)}

					{hasPandora && (
						<>
							<button
								type="button"
								onClick={() => { onBookmark(); onClose(); }}
								className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors zune-heading text-lg border-b border-[var(--color-border)]"
							>
								bookmark
							</button>
							<button
								type="button"
								onClick={() => { onSleep(); onClose(); }}
								className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors zune-heading text-lg border-b border-[var(--color-border)]"
							>
								sleep 30 days
							</button>
							<button
								type="button"
								onClick={() => { onTrackInfo(); onClose(); }}
								className="w-full text-left py-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors zune-heading text-lg"
							>
								track info
							</button>
						</>
					)}
				</nav>
			</div>
		</div>
	);
}

export function NowPlayingBar() {
	const playback = usePlaybackContext();
	const { currentTrack, isPlaying, progress, duration, togglePlayPause, triggerSkip, triggerPrevious, seek } = playback;
	const navigate = useNavigate();
	const [queueContext, setQueueContext] = useState<QueueContext>({ type: "manual" });
	const [queueIndex, setQueueIndex] = useState(0);
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const [showActionSheet, setShowActionSheet] = useState(false);
	const progressBarRef = useRef<HTMLDivElement>(null);

	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setQueueContext(queueState.context as QueueContext);
			setQueueIndex(queueState.currentIndex);
		},
	});

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_, variables) {
			toast.success(variables.positive ? "liked" : "disliked");
		},
		onError(err) {
			toast.error(`feedback failed: ${err.message}`);
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`sleep failed: ${err.message}`);
		},
	});
	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("song bookmarked");
		},
		onError(err) {
			toast.error(`bookmark failed: ${err.message}`);
		},
	});

	const handleSeek = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!progressBarRef.current || duration <= 0) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
			seek(fraction * duration);
		},
		[duration, seek],
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

	if (!currentTrack) return null;

	const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
	const hasPandoraCapabilities = isPandoraTrack(currentTrack.trackToken);
	const isRadioContext = queueContext.type === "radio";
	const isAtQueueStart = queueIndex === 0;

	return (
		<>
			<div
				className="fixed bottom-0 left-0 right-0 border-t border-[var(--color-border)] safe-bottom"
				style={{ backgroundColor: "var(--color-bg-panel)", zIndex: 40 }}
				role="region"
				aria-label="Now playing"
			>
				{/* Progress bar — expanded touch target */}
				<div
					ref={progressBarRef}
					className="group relative py-2 -my-2 cursor-pointer"
					onClick={handleSeek}
					role="slider"
					aria-label="Playback progress"
					aria-valuemin={0}
					aria-valuemax={Math.round(duration)}
					aria-valuenow={Math.round(progress)}
					aria-valuetext={`${formatTime(progress)} of ${formatTime(duration)}`}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "ArrowRight") seek(Math.min(duration, progress + 5));
						if (e.key === "ArrowLeft") seek(Math.max(0, progress - 5));
					}}
				>
				<div className="relative h-[3px] group-hover:h-[6px] group-active:h-[6px] bg-[var(--color-progress-track)] transition-all duration-150">
					<div
						className="h-full bg-[var(--color-progress)] transition-all duration-300"
						style={{ width: `${String(progressPercent)}%` }}
					/>
					<div
						className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
						style={{ left: `${String(progressPercent)}%` }}
					/>
				</div>
				</div>

				{/* Desktop layout — distilled */}
				<div className="hidden sm:flex items-center gap-5 px-6 py-3">
					{/* Album art */}
					{currentTrack.artUrl ? (
						<img
							src={currentTrack.artUrl}
							alt=""
							className="w-14 h-14 shrink-0 object-cover"
							onError={(e) => {
								e.currentTarget.style.display = "none";
								e.currentTarget.nextElementSibling?.classList.remove("hidden");
							}}
						/>
					) : null}
					<div
						className={`w-14 h-14 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${currentTrack.artUrl ? "hidden" : ""}`}
					>
						<Music className="w-5 h-5 text-[var(--color-text-dim)]" />
					</div>

					{/* Track info — click to go to context */}
					<button
						type="button"
						onClick={handleGoToContext}
						className="flex-1 min-w-0 cursor-pointer text-left"
					>
						<p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">
							{currentTrack.songName}
						</p>
						<p className="text-[0.78rem] font-light tracking-[-0.01em] text-[var(--color-text-muted)] truncate">
							{currentTrack.artistName} — {currentTrack.albumName}
						</p>
					</button>

					{/* Time */}
					<span className="zune-data text-xs text-[var(--color-text-dim)] shrink-0 tabular-nums">
						{formatTime(progress)} / {formatTime(duration)}
					</span>

					{/* Transport — only essential controls */}
					<div className="flex items-center gap-0.5">
						<button
							onClick={triggerPrevious}
							disabled={isAtQueueStart}
							className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
							type="button"
							aria-label="Previous track"
						>
							<SkipBack className="w-4 h-4" />
						</button>
						<button
							onClick={togglePlayPause}
							className="h-10 w-10 flex items-center justify-center bg-[var(--color-primary)] hover:brightness-110 transition-all text-white"
							type="button"
							aria-label={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="w-5 h-5" />
							) : (
								<Play className="w-5 h-5 ml-0.5" />
							)}
						</button>
						<button
							onClick={triggerSkip}
							className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
							type="button"
							aria-label="Skip track"
						>
							<SkipForward className="w-4 h-4" />
						</button>
					</div>

					{/* Secondary actions: Sonos + More */}
					<div className="flex items-center gap-0.5">
						<SonosSpeakerPicker currentTrackId={currentTrack.trackToken} />
						{hasPandoraCapabilities && (
							<button
								onClick={() => setShowActionSheet(true)}
								className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
								type="button"
								aria-label="More actions"
								title="More actions"
							>
								<MoreHorizontal className="w-4 h-4" />
							</button>
						)}
					</div>
				</div>

				{/* Mobile layout — maximally distilled */}
				<div className="sm:hidden flex items-center gap-3 px-5 py-3">
					{currentTrack.artUrl ? (
						<img
							src={currentTrack.artUrl}
							alt=""
							className="w-11 h-11 shrink-0 object-cover"
							onError={(e) => {
								e.currentTarget.style.display = "none";
								e.currentTarget.nextElementSibling?.classList.remove("hidden");
							}}
						/>
					) : null}
					<div
						className={`w-11 h-11 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${currentTrack.artUrl ? "hidden" : ""}`}
					>
						<Music className="w-5 h-5 text-[var(--color-text-dim)]" />
					</div>

					{/* Tap track info to open action sheet */}
					<button
						type="button"
						onClick={() => setShowActionSheet(true)}
						className="flex-1 min-w-0 cursor-pointer text-left"
					>
						<p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">
							{currentTrack.songName}
						</p>
						<p className="text-[0.75rem] font-light tracking-[-0.01em] text-[var(--color-text-muted)] truncate">
							{currentTrack.artistName}
						</p>
					</button>

					{/* Only play/pause + skip — nothing else */}
					<div className="flex items-center gap-0.5 shrink-0">
						<button
							onClick={togglePlayPause}
							className="h-10 w-10 flex items-center justify-center bg-[var(--color-primary)] hover:brightness-110 transition-all text-white"
							type="button"
							aria-label={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="w-5 h-5" />
							) : (
								<Play className="w-5 h-5 ml-0.5" />
							)}
						</button>
						<button
							onClick={triggerSkip}
							className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
							type="button"
							aria-label="Skip track"
						>
							<SkipForward className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>

			{/* Action sheet — shared between mobile and desktop */}
			{showActionSheet && (
				<ActionSheet
					onClose={() => setShowActionSheet(false)}
					onLike={handleLike}
					onDislike={handleDislike}
					onBookmark={handleBookmark}
					onSleep={handleSleep}
					onTrackInfo={() => { setShowActionSheet(false); setShowTrackInfo(true); }}
					onGoToContext={handleGoToContext}
					isRadioContext={isRadioContext}
					hasPandora={hasPandoraCapabilities}
					currentTrack={currentTrack}
					progress={progress}
					duration={duration}
				/>
			)}

			{showTrackInfo && hasPandoraCapabilities && (
				<TrackInfoModal
					trackId={currentTrack.trackToken}
					songName={currentTrack.songName}
					artistName={currentTrack.artistName}
					albumName={currentTrack.albumName}
					albumArtUrl={currentTrack.artUrl}
					duration={duration}
					onClose={() => setShowTrackInfo(false)}
				/>
			)}
		</>
	);
}
