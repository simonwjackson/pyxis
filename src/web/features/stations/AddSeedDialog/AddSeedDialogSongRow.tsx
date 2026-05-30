import { Music } from "lucide-react";
import type { AddSeedSong } from "./types";

type AddSeedDialogSongRowProps = {
  readonly song: AddSeedSong;
  readonly isDisabled: boolean;
  readonly onAdd: (musicToken: string) => void;
};

export function AddSeedDialogSongRow({
  song,
  isDisabled,
  onAdd,
}: AddSeedDialogSongRowProps) {
  return (
    <button
      key={song.musicToken}
      type="button"
      onClick={() => onAdd(song.musicToken)}
      disabled={isDisabled}
      className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left disabled:opacity-50"
    >
      <div className="w-8 h-8 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
        <Music className="w-4 h-4 text-[var(--color-text-muted)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text)] truncate">
          {song.songName}
        </p>
        <p className="text-xs text-[var(--color-text-dim)] truncate">
          {song.artistName}
        </p>
      </div>
      <span className="ml-auto text-xs text-[var(--color-primary)] bg-[var(--color-bg-highlight)] px-2 py-0.5 shrink-0">
        Add
      </span>
    </button>
  );
}
