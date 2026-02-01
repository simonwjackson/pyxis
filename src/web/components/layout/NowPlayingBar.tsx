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
};

export function NowPlayingBar({
	currentTrack,
	isPlaying,
	progress,
	duration,
	onTogglePlayPause,
}: NowPlayingBarProps) {
	if (!currentTrack) return null;

	const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

	return (
		<div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 py-2">
			<div className="h-1 bg-zinc-800 rounded-full mb-2">
				<div
					className="h-full bg-cyan-500 rounded-full transition-all"
					style={{ width: `${String(progressPercent)}%` }}
				/>
			</div>
			<div className="flex items-center justify-between">
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-zinc-100 truncate">
						{currentTrack.songName}
					</p>
					<p className="text-xs text-zinc-400 truncate">
						{currentTrack.artistName} — {currentTrack.albumName}
					</p>
				</div>
				<button
					onClick={onTogglePlayPause}
					className="mx-4 h-10 w-10 flex items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-700 transition-colors text-white"
					type="button"
				>
					{isPlaying ? "⏸" : "▶"}
				</button>
				<div className="flex-1" />
			</div>
		</div>
	);
}
