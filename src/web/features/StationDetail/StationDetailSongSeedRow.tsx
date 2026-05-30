import { Music, X } from "lucide-react";
import type { StationSeed } from "./types";

type StationDetailSongSeedRowProps = {
  readonly seed: StationSeed;
  readonly isRemoving: boolean;
  readonly onRemove: (seedId: string) => void;
};

export function StationDetailSongSeedRow({
  seed,
  isRemoving,
  onRemove,
}: StationDetailSongSeedRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-pyxis-highlight group">
      <div className="w-8 h-8 bg-pyxis-highlight flex items-center justify-center shrink-0">
        <Music className="w-4 h-4 text-pyxis-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-pyxis-muted truncate">{seed.songName}</p>
        {seed.artistName ? (
          <p className="text-xs text-pyxis-dim truncate">{seed.artistName}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onRemove(seed.seedId)}
        disabled={isRemoving}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-pyxis-dim hover:text-pyxis-error hover:bg-pyxis-highlight transition-all disabled:opacity-50"
        title="Remove seed"
        aria-label={`Remove ${seed.songName ?? "song"} seed`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
