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
    <div className="flex items-center gap-3 p-3 bg-[var(--color-bg-highlight)] group">
      <div className="w-8 h-8 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
        <Music className="w-4 h-4 text-[var(--color-text-muted)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-muted)] truncate">
          {seed.songName}
        </p>
        {seed.artistName ? (
          <p className="text-xs text-[var(--color-text-dim)] truncate">
            {seed.artistName}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onRemove(seed.seedId)}
        disabled={isRemoving}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-text-dim)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-highlight)] transition-all disabled:opacity-50"
        title="Remove seed"
        aria-label={`Remove ${seed.songName ?? "song"} seed`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
