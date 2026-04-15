import { Pause, Play, SkipForward } from "lucide-react";

type NowPlayingMobileTransportProps = {
	readonly isPlaying: boolean;
	readonly onTogglePlayPause: () => void;
	readonly onSkip: () => void;
};

export function NowPlayingMobileTransport({
	isPlaying,
	onTogglePlayPause,
	onSkip,
}: NowPlayingMobileTransportProps) {
	return (
		<div className="flex items-center gap-0.5 shrink-0">
			<button
				onClick={onTogglePlayPause}
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
				onClick={onSkip}
				className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-bg-highlight)] transition-colors text-[var(--color-text-muted)]"
				type="button"
				aria-label="Skip track"
			>
				<SkipForward className="w-4 h-4" />
			</button>
		</div>
	);
}
