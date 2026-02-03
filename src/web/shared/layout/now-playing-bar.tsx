import { useState, useRef, useCallback } from "react";
import {
	Play,
	Pause,
	SkipForward,
	SkipBack,
	Music,
	ThumbsUp,
	ThumbsDown,
	Bookmark,
	Moon,
	Info,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { usePlaybackContext } from "../playback/playback-context";
import { trpc } from "../lib/trpc";
import { formatTime } from "../lib/now-playing-utils";
import { TrackInfoModal } from "../track-info-modal";

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

export function NowPlayingBar() {
	const playback = usePlaybackContext();
	const { currentTrack, isPlaying, progress, duration, togglePlayPause, triggerSkip, triggerPrevious, seek } = playback;
	const navigate = useNavigate();
	const [queueContext, setQueueContext] = useState<QueueContext>({ type: "manual" });
	const [queueIndex, setQueueIndex] = useState(0);
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const progressBarRef = useRef<HTMLDivElement>(null);

	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setQueueContext(queueState.context as QueueContext);
			setQueueIndex(queueState.currentIndex);
		},
	});

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_, variables) {
			toast.success(variables.positive ? "Thumbs up!" : "Thumbs down");
		},
		onError(err) {
			toast.error(`Feedback failed: ${err.message}`);
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`Sleep failed: ${err.message}`);
		},
	});
	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
		onError(err) {
			toast.error(`Bookmark failed: ${err.message}`);
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

	if (!currentTrack) return null;

	const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
	const hasPandoraCapabilities = isPandoraTrack(currentTrack.trackToken);
	const isRadioContext = queueContext.type === "radio";
	const isAtQueueStart = queueIndex === 0;

	return (
		<>
			<div
				className="fixed bottom-0 left-0 right-0 border-t border-[var(--color-border)] backdrop-blur safe-bottom"
				style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-panel) 95%, transparent)", zIndex: 40 }}
				role="region"
				aria-label="Now playing"
			>
				{/* Seekable progress bar */}
				<div
					ref={progressBarRef}
					className="group relative h-1 bg-[var(--color-progress-track)] cursor-pointer"
					onClick={handleSeek}
					title="Seek"
				>
					<div
						className="h-full bg-[var(--color-progress)] transition-all duration-300"
						style={{ width: `${String(progressPercent)}%` }}
					/>
					<div
						className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
						style={{ left: `${String(progressPercent)}%` }}
					/>
				</div>

				{/* Desktop layout (>=640px) */}
				<div className="hidden sm:flex items-center gap-3 px-4 py-2">
					{/* Album art */}
					{currentTrack.artUrl ? (
						<img
							src={currentTrack.artUrl}
							alt=""
							className="w-16 h-16 shrink-0 rounded-lg object-cover"
							onError={(e) => {
								e.currentTarget.style.display = "none";
								e.currentTarget.nextElementSibling?.classList.remove("hidden");
							}}
						/>
					) : null}
					<div
						className={`w-16 h-16 rounded-lg bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${currentTrack.artUrl ? "hidden" : ""}`}
					>
						<Music className="w-7 h-7 text-[var(--color-text-dim)]" />
					</div>

					{/* Track info (clickable) */}
					<button
						type="button"
						onClick={() => navigateToContext(navigate, queueContext)}
						className="flex-1 min-w-0 cursor-pointer text-left"
					>
						<p className="text-sm font-medium text-[var(--color-text)] truncate">
							{currentTrack.songName}
						</p>
						<p className="text-xs text-[var(--color-text-muted)] truncate">
							{currentTrack.artistName} — {currentTrack.albumName}
						</p>
						<p className="text-xs text-[var(--color-text-dim)] mt-0.5">
							{formatTime(progress)} / {formatTime(duration)}
						</p>
					</button>

					{/* Transport controls */}
					<div className="flex items-center gap-1">
						<button
							onClick={triggerPrevious}
							disabled={isAtQueueStart}
							className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)] disabled:opacity-30 disabled:cursor-not-allowed"
							type="button"
							aria-label="Previous track"
						>
							<SkipBack className="w-4 h-4" />
						</button>
						<button
							onClick={togglePlayPause}
							className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--color-primary)] hover:brightness-110 transition-all text-white"
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
							className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
							type="button"
							aria-label="Skip track"
						>
							<SkipForward className="w-4 h-4" />
						</button>
					</div>

					{/* Pandora actions */}
					{hasPandoraCapabilities && (
						<>
							<div className="w-px h-8 bg-[var(--color-border)]" />
							<div className="flex items-center gap-0.5">
								{isRadioContext && (
									<>
										<button
											onClick={handleDislike}
											className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-disliked)]"
											type="button"
											title="Dislike"
											aria-label="Dislike"
										>
											<ThumbsDown className="w-4 h-4" />
										</button>
										<button
											onClick={handleLike}
											className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-liked)]"
											type="button"
											title="Like"
											aria-label="Like"
										>
											<ThumbsUp className="w-4 h-4" />
										</button>
									</>
								)}
								<button
									onClick={handleBookmark}
									className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
									type="button"
									title="Bookmark"
									aria-label="Bookmark"
								>
									<Bookmark className="w-4 h-4" />
								</button>
								<button
									onClick={handleSleep}
									className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
									type="button"
									title="Sleep (30 days)"
									aria-label="Sleep track for 30 days"
								>
									<Moon className="w-4 h-4" />
								</button>
								<button
									onClick={() => setShowTrackInfo(true)}
									className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
									type="button"
									title="Track info"
									aria-label="Track info"
								>
									<Info className="w-4 h-4" />
								</button>
							</div>
						</>
					)}
				</div>

				{/* Mobile layout (<640px) */}
				<div className="sm:hidden">
					{/* Top row: art + info + play/skip */}
					<div className="flex items-center gap-3 px-3 py-2">
						{currentTrack.artUrl ? (
							<img
								src={currentTrack.artUrl}
								alt=""
								className="w-12 h-12 shrink-0 rounded-lg object-cover"
								onError={(e) => {
									e.currentTarget.style.display = "none";
									e.currentTarget.nextElementSibling?.classList.remove("hidden");
								}}
							/>
						) : null}
						<div
							className={`w-12 h-12 rounded-lg bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${currentTrack.artUrl ? "hidden" : ""}`}
						>
							<Music className="w-5 h-5 text-[var(--color-text-dim)]" />
						</div>
						<button
							type="button"
							onClick={() => navigateToContext(navigate, queueContext)}
							className="flex-1 min-w-0 cursor-pointer text-left"
						>
							<p className="text-sm font-medium text-[var(--color-text)] truncate">
								{currentTrack.songName}
							</p>
							<p className="text-xs text-[var(--color-text-muted)] truncate">
								{currentTrack.artistName} — {currentTrack.albumName}
							</p>
						</button>
						<div className="flex items-center gap-1">
							<button
								onClick={togglePlayPause}
								className="h-10 w-10 flex items-center justify-center rounded-full bg-[var(--color-primary)] hover:brightness-110 transition-all text-white"
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
								className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
								type="button"
								aria-label="Skip track"
							>
								<SkipForward className="w-4 h-4" />
							</button>
						</div>
					</div>

					{/* Bottom row: time + actions */}
					<div className="flex items-center justify-between px-3 pb-2 text-xs text-[var(--color-text-dim)]">
						<span>{formatTime(progress)} / {formatTime(duration)}</span>
						{hasPandoraCapabilities && (
							<div className="flex items-center gap-1">
								{isRadioContext && (
									<>
										<button
											onClick={handleDislike}
											className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-disliked)]"
											type="button"
											title="Dislike"
											aria-label="Dislike"
										>
											<ThumbsDown className="w-3.5 h-3.5" />
										</button>
										<button
											onClick={handleLike}
											className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-liked)]"
											type="button"
											title="Like"
											aria-label="Like"
										>
											<ThumbsUp className="w-3.5 h-3.5" />
										</button>
									</>
								)}
								<button
									onClick={handleBookmark}
									className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-text-muted)]"
									type="button"
									title="Bookmark"
									aria-label="Bookmark"
								>
									<Bookmark className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={handleSleep}
									className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-text-muted)]"
									type="button"
									title="Sleep (30 days)"
									aria-label="Sleep track for 30 days"
								>
									<Moon className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={() => setShowTrackInfo(true)}
									className="h-7 w-7 flex items-center justify-center rounded text-[var(--color-text-muted)]"
									type="button"
									title="Track info"
									aria-label="Track info"
								>
									<Info className="w-3.5 h-3.5" />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

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
