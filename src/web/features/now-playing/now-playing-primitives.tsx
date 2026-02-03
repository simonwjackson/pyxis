import { type ReactNode } from "react";
import {
	Play,
	Pause,
	SkipForward,
	SkipBack,
	ThumbsUp,
	ThumbsDown,
	Bookmark,
	Moon,
	Info,
	Music,
} from "lucide-react";
import { Button } from "@/web/shared/ui/button";
import { TrackInfoModal } from "@/web/shared/track-info-modal";
import { useNowPlaying } from "./now-playing-context";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { formatTime } from "@/web/shared/lib/now-playing-utils";

export function Artwork() {
	const { currentTrack } = useNowPlaying();
	const playback = usePlaybackContext();
	if (!currentTrack) return null;

	const artUrl = currentTrack.albumArtUrl ?? playback.currentTrack?.artUrl;

	return (
		<div className="w-56 h-56 md:w-72 md:h-72 relative">
			{artUrl ? (
				<img
					src={artUrl}
					alt={`${currentTrack.albumName} album art`}
					className="w-full h-full rounded-2xl shadow-2xl object-cover"
					onError={(e) => {
						e.currentTarget.style.display = "none";
						e.currentTarget.nextElementSibling?.classList.remove("hidden");
					}}
				/>
			) : null}
			<div
				className={`w-full h-full bg-[var(--color-bg-highlight)] rounded-2xl shadow-2xl flex items-center justify-center ${artUrl ? "hidden absolute inset-0" : ""}`}
			>
				<Music className="w-20 h-20 text-[var(--color-text-dim)]" />
			</div>
			{playback.isPlaying && (
				<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--color-playing)] rounded-full text-xs font-medium text-[var(--color-bg)]">
					PLAYING
				</div>
			)}
		</div>
	);
}

export function TrackInfo({
	albumLabel,
}: {
	readonly albumLabel?: string;
}) {
	const { currentTrack } = useNowPlaying();
	if (!currentTrack) return null;

	return (
		<div className="text-center">
			<h2 className="text-2xl md:text-3xl font-bold text-[var(--color-text)]">
				{currentTrack.songName}
			</h2>
			<p className="text-lg text-[var(--color-text-muted)] mt-1">
				{currentTrack.artistName}
			</p>
			<p className="text-sm text-[var(--color-text-dim)]">
				{albumLabel ?? currentTrack.albumName}
			</p>
		</div>
	);
}

export function ProgressBar() {
	const playback = usePlaybackContext();

	const progressPercent =
		playback.duration > 0
			? (playback.progress / playback.duration) * 100
			: 0;

	return (
		<div className="w-full max-w-md">
			<div className="h-1 bg-[var(--color-progress-track)] rounded-full overflow-hidden">
				<div
					className="h-full bg-[var(--color-progress)] transition-all duration-300"
					style={{ width: `${String(progressPercent)}%` }}
				/>
			</div>
			<div className="flex justify-between text-xs text-[var(--color-text-dim)] mt-1">
				<span>{formatTime(playback.progress)}</span>
				<span>{formatTime(playback.duration)}</span>
			</div>
		</div>
	);
}

export function Controls({
	before,
	after,
	skip,
}: {
	readonly before?: ReactNode;
	readonly after?: ReactNode;
	readonly skip?: ReactNode;
}) {
	const playback = usePlaybackContext();

	return (
		<div
			className="flex items-center gap-6"
			role="group"
			aria-label="Playback controls"
		>
			{before}
			<Button
				size="icon"
				className="h-14 w-14 rounded-full bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
				onClick={playback.togglePlayPause}
				aria-label={playback.isPlaying ? "Pause" : "Play"}
			>
				{playback.isPlaying ? (
					<Pause className="w-7 h-7" />
				) : (
					<Play className="w-7 h-7 ml-0.5" />
				)}
			</Button>
			{skip ?? <SkipButton />}
			{after}
		</div>
	);
}

export function PreviousButton() {
	const { handlePrevious, trackIndex } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-12 w-12"
			onClick={handlePrevious}
			disabled={trackIndex === 0}
			aria-label="Previous track"
		>
			<SkipBack className="w-6 h-6" />
		</Button>
	);
}

export function SkipButton() {
	const { handleSkip } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-12 w-12"
			onClick={handleSkip}
			aria-label="Skip to next track"
		>
			<SkipForward className="w-6 h-6" />
		</Button>
	);
}

export function BoundedSkipButton() {
	const { handleSkip, tracks, trackIndex } = useNowPlaying();

	const disabled = tracks.length > 0 && trackIndex >= tracks.length - 1;

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-12 w-12"
			onClick={handleSkip}
			disabled={disabled}
			aria-label="Skip to next track"
		>
			<SkipForward className="w-6 h-6" />
		</Button>
	);
}

export function FeedbackButtons() {
	const { handleLike, handleDislike } = useNowPlaying();

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="text-[var(--color-disliked)] h-12 w-12"
				onClick={handleDislike}
				aria-label="Dislike this track"
			>
				<ThumbsDown className="w-6 h-6" />
			</Button>
		</>
	);
}

export function LikeButton() {
	const { handleLike } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="icon"
			className="text-[var(--color-liked)] h-12 w-12"
			onClick={handleLike}
			aria-label="Like this track"
		>
			<ThumbsUp className="w-6 h-6" />
		</Button>
	);
}

export function Actions({ children }: { readonly children?: ReactNode }) {
	if (!children) return null;

	return (
		<div className="flex items-center gap-4 text-[var(--color-text-dim)]">
			{children}
		</div>
	);
}

export function InfoButton() {
	const { setShowTrackInfo } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="sm"
			className="gap-1.5"
			onClick={() => setShowTrackInfo(true)}
			title="Track info"
		>
			<Info className="w-4 h-4" /> Info
		</Button>
	);
}

export function BookmarkButton() {
	const { handleBookmark } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="sm"
			className="gap-1.5"
			onClick={handleBookmark}
			title="Bookmark song"
		>
			<Bookmark className="w-4 h-4" /> Bookmark
		</Button>
	);
}

export function SleepButton() {
	const { handleSleep } = useNowPlaying();

	return (
		<Button
			variant="ghost"
			size="sm"
			className="gap-1.5"
			onClick={handleSleep}
			title="Sleep song (30 days)"
		>
			<Moon className="w-4 h-4" /> Sleep
		</Button>
	);
}

export function UpNext() {
	const { tracks, trackIndex, handleJumpToTrack } = useNowPlaying();
	const upNextTracks = tracks.slice(trackIndex + 1, trackIndex + 5);
	const remainingCount = tracks.length - trackIndex - 1;

	if (upNextTracks.length === 0) return null;

	return (
		<div className="w-full max-w-md">
			<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
				Up Next
			</h3>
			<div className="space-y-0.5">
				{upNextTracks.map((track, i) => (
					<button
						key={track.id}
						type="button"
						onClick={() => handleJumpToTrack(trackIndex + 1 + i)}
						className="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)] transition-colors"
					>
						<span className="w-5 text-right text-xs text-[var(--color-text-dim)]">
							{String(i + 1)}
						</span>
						<span className="flex-1 truncate">{track.songName}</span>
						<span className="text-xs text-[var(--color-text-dim)] truncate max-w-[140px]">
							{track.artistName}
						</span>
					</button>
				))}
				{remainingCount > 4 && (
					<p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
						+{String(remainingCount - 4)} more
					</p>
				)}
			</div>
		</div>
	);
}

export function Tracklist() {
	const { tracks, trackIndex, handleJumpToTrack } = useNowPlaying();

	if (tracks.length === 0) return null;

	return (
		<div className="w-full max-w-md">
			<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
				Tracklist
			</h3>
			<div className="space-y-0.5 max-h-48 overflow-y-auto">
				{tracks.map((track, index) => {
					const isActive = index === trackIndex;
					return (
						<button
							key={track.id}
							type="button"
							onClick={() => handleJumpToTrack(index)}
							className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${isActive ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"}`}
						>
							<span className="w-5 text-right text-xs">
								{String(index + 1)}
							</span>
							<span className="flex-1 truncate">{track.songName}</span>
							{track.duration != null && (
								<span className="text-xs">{formatTime(track.duration)}</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function TrackInfoModalWrapper() {
	const { currentTrack, showTrackInfo, setShowTrackInfo } = useNowPlaying();
	const playback = usePlaybackContext();

	if (!currentTrack?.capabilities.explain || !showTrackInfo) return null;

	return (
		<TrackInfoModal
			trackId={currentTrack.id}
			songName={currentTrack.songName}
			artistName={currentTrack.artistName}
			albumName={currentTrack.albumName}
			albumArtUrl={currentTrack.albumArtUrl}
			duration={playback.duration}
			onClose={() => setShowTrackInfo(false)}
		/>
	);
}
