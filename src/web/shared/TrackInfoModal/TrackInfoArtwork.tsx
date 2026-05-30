import { Music } from "lucide-react";

type TrackInfoArtworkProps = {
  readonly albumArtUrl?: string | undefined;
  readonly albumName: string;
};

export function TrackInfoArtwork({
  albumArtUrl,
  albumName,
}: TrackInfoArtworkProps) {
  if (albumArtUrl) {
    return (
      <img
        src={albumArtUrl}
        alt={`${albumName} album art`}
        className="w-20 h-20 shrink-0 object-cover"
      />
    );
  }

  return (
    <div className="w-20 h-20 shrink-0 bg-[var(--color-bg-highlight)] flex items-center justify-center">
      <Music className="w-8 h-8 text-[var(--color-text-dim)]" />
    </div>
  );
}
