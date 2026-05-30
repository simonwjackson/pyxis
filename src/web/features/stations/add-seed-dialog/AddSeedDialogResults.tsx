import { AddSeedDialogArtistRow } from "./AddSeedDialogArtistRow";
import { AddSeedDialogSongRow } from "./AddSeedDialogSongRow";
import type { AddSeedArtist, AddSeedSong } from "./types";

type AddSeedDialogResultsProps = {
  readonly artists: readonly AddSeedArtist[];
  readonly songs: readonly AddSeedSong[];
  readonly isMutating: boolean;
  readonly onAdd: (musicToken: string) => void;
};

export function AddSeedDialogResults({
  artists,
  songs,
  isMutating,
  onAdd,
}: AddSeedDialogResultsProps) {
  return (
    <>
      {artists.length > 0 ? (
        <div className="mb-2">
          <p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
            Artists
          </p>
          {artists.map((artist) => (
            <AddSeedDialogArtistRow
              key={artist.musicToken}
              artist={artist}
              isDisabled={isMutating}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : null}

      {songs.length > 0 ? (
        <div>
          <p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
            Songs
          </p>
          {songs.map((song) => (
            <AddSeedDialogSongRow
              key={song.musicToken}
              song={song}
              isDisabled={isMutating}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
