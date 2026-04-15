import { Music } from "lucide-react";
import type { PlaybackTrack } from "@/web/shared/playback/types";

type NowPlayingArtworkProps = {
	readonly track: PlaybackTrack;
	readonly sizeClassName: string;
	readonly iconClassName: string;
};

export function NowPlayingArtwork({
	track,
	sizeClassName,
	iconClassName,
}: NowPlayingArtworkProps) {
	return (
		<>
			{track.artUrl ? (
				<img
					src={track.artUrl}
					alt=""
					className={`${sizeClassName} shrink-0 object-cover`}
					onError={(event) => {
						event.currentTarget.style.display = "none";
						event.currentTarget.nextElementSibling?.classList.remove("hidden");
					}}
				/>
			) : null}
			<div
				className={`${sizeClassName} bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 ${track.artUrl ? "hidden" : ""}`}
			>
				<Music className={iconClassName} />
			</div>
		</>
	);
}
