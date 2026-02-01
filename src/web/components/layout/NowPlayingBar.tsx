import { Play, Pause, SkipForward } from "lucide-react";
import { Link } from "@tanstack/react-router";

type NowPlayingBarProps = {
	readonly currentTrack: {
		readonly songName: string;
		readonly artistName: string;
		readonly albumName: string;
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
		<div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800" role="region" aria-label="Now playing">
			<div className="h-1 bg-zinc-800">
				<div
					className="h-full bg-cyan-500 transition-all duration-300"
					style={{ width: `${String(progressPercent)}%` }}
				/>
			</div>
			<div className="flex items-center gap-4 px-4 py-2">
				<Link
					to="/now-playing"
					className="flex-1 min-w-0 cursor-pointer"
				>
					<p className="text-sm font-medium text-zinc-100 truncate">
						{currentTrack.songName}
					</p>
					<p className="text-xs text-zinc-400 truncate">
						{currentTrack.artistName} — {currentTrack.albumName}
					</p>
				</Link>
				<div className="flex items-center gap-1">
					<button
						onClick={onTogglePlayPause}
						className="h-10 w-10 flex items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-500 transition-colors text-white"
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
						className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-zinc-800 transition-colors text-zinc-400"
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
