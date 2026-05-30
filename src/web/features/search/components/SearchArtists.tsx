import { User } from "lucide-react";
import type { SearchArtist } from "../types";
import { SearchSectionHeader } from "./SearchSectionHeader";

type SearchArtistsProps = {
  readonly artists: readonly SearchArtist[];
  readonly onCreateStation: (musicToken: string) => void;
};

export function SearchArtists({
  artists,
  onCreateStation,
}: SearchArtistsProps) {
  if (artists.length === 0) return null;

  return (
    <section>
      <SearchSectionHeader>artists</SearchSectionHeader>
      <ul className="space-y-1">
        {artists.map((artist) => (
          <li key={artist.musicToken}>
            <button
              onClick={() => onCreateStation(artist.musicToken)}
              className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left"
              type="button"
            >
              <div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-[var(--color-text-muted)]" />
              </div>
              <div className="flex-1">
                <p className="zune-list-title text-[var(--color-text)]">
                  {artist.artistName}
                </p>
                <p className="zune-eyebrow text-[var(--color-text-dim)]">
                  pandora
                </p>
              </div>
              <span className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors">
                + station
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
