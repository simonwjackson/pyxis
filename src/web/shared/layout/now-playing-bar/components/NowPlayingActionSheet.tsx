import { X } from "lucide-react";
import type { ReactNode } from "react";
import { formatTime } from "@/web/shared/lib/now-playing-utils";
import type { PlaybackTrack } from "@/web/shared/playback/types";
import { NowPlayingArtwork } from "./NowPlayingArtwork";

type NowPlayingActionSheetProps = {
  readonly onClose: () => void;
  readonly track: PlaybackTrack;
  readonly progress: number;
  readonly duration: number;
  readonly children: ReactNode;
};

export function NowPlayingActionSheet({
  onClose,
  track,
  progress,
  duration,
  children,
}: NowPlayingActionSheetProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Track actions"
    >
      <div
        className="fixed inset-0 bg-black/50 action-sheet-backdrop"
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-lg bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] safe-bottom action-sheet-content"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-6 pt-6 pb-4">
          <NowPlayingArtwork
            track={track}
            sizeClassName="w-16 h-16"
            iconClassName="w-6 h-6 text-[var(--color-text-dim)]"
          />
          <div className="flex-1 min-w-0">
            <p className="zune-title text-[var(--color-text)] truncate">
              {track.songName}
            </p>
            <p className="text-sm font-light text-[var(--color-text-muted)] truncate">
              {track.artistName} — {track.albumName}
            </p>
            <p className="zune-data text-xs text-[var(--color-text-dim)] mt-1">
              {formatTime(progress)} / {formatTime(duration)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-6 pb-6 space-y-0.5">{children}</nav>
      </div>
    </div>
  );
}
