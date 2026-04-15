import type { PlaybackTrack } from "@/web/shared/playback/types";

type NowPlayingTrackSummaryProps = {
	readonly track: PlaybackTrack;
	readonly layout: "desktop" | "mobile";
	readonly onClick: () => void;
};

export function NowPlayingTrackSummary({
	track,
	layout,
	onClick,
}: NowPlayingTrackSummaryProps) {
	const titleClassName =
		layout === "desktop"
			? "zune-title text-[0.95rem] text-[var(--color-text)] truncate"
			: "zune-title text-[0.95rem] text-[var(--color-text)] truncate";
	const subtitleClassName =
		layout === "desktop"
			? "text-[0.78rem] font-light tracking-[-0.01em] text-[var(--color-text-muted)] truncate"
			: "text-[0.75rem] font-light tracking-[-0.01em] text-[var(--color-text-muted)] truncate";
	const subtitle =
		layout === "desktop"
			? `${track.artistName} — ${track.albumName}`
			: track.artistName;

	return (
		<button
			type="button"
			onClick={onClick}
			className="flex-1 min-w-0 cursor-pointer text-left"
		>
			<p className={titleClassName}>{track.songName}</p>
			<p className={subtitleClassName}>{subtitle}</p>
		</button>
	);
}
