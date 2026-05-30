import { User } from "lucide-react";
import type { AddSeedArtist } from "./types";

type AddSeedDialogArtistRowProps = {
  readonly artist: AddSeedArtist;
  readonly isDisabled: boolean;
  readonly onAdd: (musicToken: string) => void;
};

export function AddSeedDialogArtistRow({
  artist,
  isDisabled,
  onAdd,
}: AddSeedDialogArtistRowProps) {
  return (
    <button
      key={artist.musicToken}
      type="button"
      onClick={() => onAdd(artist.musicToken)}
      disabled={isDisabled}
      className="w-full flex items-center gap-3 p-3 hover:bg-pyxis-highlight text-left disabled:opacity-50"
    >
      <div className="w-8 h-8 bg-pyxis-highlight flex items-center justify-center shrink-0">
        <User className="w-4 h-4 text-pyxis-muted" />
      </div>
      <span className="text-sm text-pyxis-text truncate">
        {artist.artistName}
      </span>
      <span className="ml-auto text-xs text-pyxis-primary bg-pyxis-highlight px-2 py-0.5 shrink-0">
        Add
      </span>
    </button>
  );
}
