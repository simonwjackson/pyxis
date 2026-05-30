import { TrackInfoArtwork } from "./TrackInfoArtwork";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

type TrackInfoHeaderProps = {
  readonly songName: string;
  readonly artistName: string;
  readonly albumName: string;
  readonly albumArtUrl?: string | undefined;
  readonly duration: number;
};

export function TrackInfoHeader({
  songName,
  artistName,
  albumName,
  albumArtUrl,
  duration,
}: TrackInfoHeaderProps) {
  return (
    <div className="flex gap-4">
      <TrackInfoArtwork albumArtUrl={albumArtUrl} albumName={albumName} />
      <div className="min-w-0">
        <p className="font-semibold text-pyxis-text truncate">{songName}</p>
        <p className="text-sm text-pyxis-muted truncate">{artistName}</p>
        <p className="text-sm text-pyxis-dim truncate">{albumName}</p>
        {duration > 0 ? (
          <p className="text-xs text-pyxis-dim mt-1">
            Duration: {formatDuration(duration)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
