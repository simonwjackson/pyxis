type NowPlayingProgressBarProps = {
	readonly progress: number;
	readonly duration: number;
	readonly progressPercent: number;
	readonly onSeek: (event: React.MouseEvent<HTMLDivElement>) => void;
	readonly onSeekStep: (delta: number) => void;
	readonly progressBarRef: React.RefObject<HTMLDivElement | null>;
	readonly valueText: string;
};

export function NowPlayingProgressBar({
	progress,
	duration,
	progressPercent,
	onSeek,
	onSeekStep,
	progressBarRef,
	valueText,
}: NowPlayingProgressBarProps) {
	return (
		<div
			ref={progressBarRef}
			className="group relative py-2 -my-2 cursor-pointer"
			onClick={onSeek}
			role="slider"
			aria-label="Playback progress"
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(progress)}
			aria-valuetext={valueText}
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "ArrowRight") onSeekStep(5);
				if (event.key === "ArrowLeft") onSeekStep(-5);
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
	);
}
