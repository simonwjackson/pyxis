import { LayoutGrid } from "lucide-react";
import type { SearchGenreStation } from "../types";
import { SearchSectionHeader } from "./SearchSectionHeader";

type SearchGenresProps = {
  readonly genres: readonly SearchGenreStation[];
  readonly onCreateStation: (musicToken: string) => void;
};

export function SearchGenres({ genres, onCreateStation }: SearchGenresProps) {
  if (genres.length === 0) return null;

  return (
    <section>
      <SearchSectionHeader>genres</SearchSectionHeader>
      <ul className="space-y-1">
        {genres.map((genre) => (
          <li key={genre.musicToken}>
            <button
              onClick={() => onCreateStation(genre.musicToken)}
              className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left"
              type="button"
            >
              <div className="w-10 h-10 bg-[var(--color-bg-elevated)] flex items-center justify-center shrink-0">
                <LayoutGrid className="w-5 h-5 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1">
                <p className="zune-list-title text-[var(--color-text)]">
                  {genre.stationName}
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
