import { Music, Radio } from "lucide-react";
import type { SearchTrack } from "../types";
import { SearchSectionHeader } from "./SearchSectionHeader";

type SearchTracksProps = {
  readonly tracks: readonly SearchTrack[];
  readonly onStartRadio?: (track: SearchTrack) => void;
};

export function SearchTracks({ tracks, onStartRadio }: SearchTracksProps) {
  if (tracks.length === 0) return null;

  return (
    <section>
      <SearchSectionHeader>songs</SearchSectionHeader>
      <ul className="space-y-1">
        {tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-4 p-4 hover:bg-[var(--color-bg-highlight)]"
          >
            <div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden">
              {track.artworkUrl ? (
                <img
                  src={track.artworkUrl}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-5 h-5 text-[var(--color-text-muted)]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="zune-list-title text-[var(--color-text)] truncate">
                {track.title}
              </p>
              <p className="zune-eyebrow text-[var(--color-text-dim)]">
                {track.artist}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {track.capabilities.radio && onStartRadio ? (
                <button
                  type="button"
                  onClick={() => onStartRadio(track)}
                  className="text-[10px] sm:text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors flex items-center gap-1"
                >
                  <Radio className="w-3 h-3" />
                  Start Radio
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
