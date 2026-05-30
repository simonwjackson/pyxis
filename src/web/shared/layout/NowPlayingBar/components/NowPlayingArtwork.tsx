import type { PlaybackTrack } from "@app/shared/playback/types";
import { Music } from "lucide-react";

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
        className={`${sizeClassName} bg-pyxis-highlight flex items-center justify-center shrink-0 ${track.artUrl ? "hidden" : ""}`}
      >
        <Music className={iconClassName} />
      </div>
    </>
  );
}
