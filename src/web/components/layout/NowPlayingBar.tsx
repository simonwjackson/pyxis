import { Play, Pause, SkipForward, Music } from "lucide-react";
import { Link } from "@tanstack/react-router";

type NowPlayingBarProps = {
	readonly currentTrack: {
		readonly songName: string;
		readonly artistName: string;
		readonly albumName: string;
		readonly artUrl?: string;
	} | null;
	readonly isPlaying: boolean;
	readonly progress: number;
	readonly duration: number;
	readonly onTogglePlayPause: () => void;
	readonly onSkip?: () => void;
};

export function NowPlayingBar({
	currentTrack,
	isPlaying,
	progress,
	duration,
	onTogglePlayPause,
	onSkip,
}: NowPlayingBarProps) {
	if (!currentTrack) return null;

	const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

	return (
		<div className="fixed bottom-0 left-0 right-0 backdrop-blur border-t border-[var(--color-border)]" style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-panel) 95%, transparent)" }} role="region" aria-label="Now playing">
			<div className="h-1 bg-[var(--color-progress-track)]">
				<div
					className="h-full bg-[var(--color-progress)] transition-all duration-300"
					style={{ width: `${String(progressPercent)}%` }}
				/>
			</div>
			<div className="flex items-center gap-4 px-4 py-2">
				{currentTrack.artUrl ? (
					<img
						src={currentTrack.artUrl}
						alt=""
						className="w-10 h-10 rounded object-cover"
						onError={(e) => {
							e.currentTarget.style.display = "none";
							e.currentTarget.nextElementSibling?.classList.remove("hidden");
						}}
					/>
				) : null}
				<div
					className={`w-10 h-10 rounded bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${currentTrack.artUrl ? "hidden" : ""}`}
				>
					<Music className="w-5 h-5 text-[var(--color-text-dim)]" />
				</div>
				<Link
					to="/now-playing"
					className="flex-1 min-w-0 cursor-pointer"
				>
					<p className="text-sm font-medium text-[var(--color-text)] truncate">
						{currentTrack.songName}
					</p>
					<p className="text-xs text-[var(--color-text-muted)] truncate">
						{currentTrack.artistName} — {currentTrack.albumName}
					</p>
				</Link>
				<div className="flex items-center gap-1">
					<button
						onClick={onTogglePlayPause}
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
						onClick={onSkip}
						className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
						type="button"
						aria-label="Skip track"
					>
						<SkipForward className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	);
}
