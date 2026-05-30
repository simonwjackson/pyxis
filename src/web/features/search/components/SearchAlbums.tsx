import { Link } from "@tanstack/react-router";
import { Disc3, Loader2, Play } from "lucide-react";
import { formatPlacementLabel } from "@app/shared/lib/library-placement";
import type { SearchAlbum } from "../types";
import { SearchHotBadge } from "./SearchHotBadge";
import { SearchPlacementBadge } from "./SearchPlacementBadge";
import { SearchSectionHeader } from "./SearchSectionHeader";

type SearchAlbumsProps = {
  readonly albums: readonly SearchAlbum[];
  readonly onPlayAlbum?: (albumId: string) => void;
  readonly playingAlbumId?: string | null;
  readonly onSaveAlbum?: (albumId: string) => void;
};

export function SearchAlbums({
  albums,
  onPlayAlbum,
  playingAlbumId,
  onSaveAlbum,
}: SearchAlbumsProps) {
  if (albums.length === 0) return null;

  return (
    <section>
      <SearchSectionHeader>albums</SearchSectionHeader>
      <div className="space-y-1">
        {albums.map((album) => {
          const isLoadingPlay = playingAlbumId === album.id;
          const state = album.state;
          const canAdd = !state || state.placement === "dismissed";
          const actionLabel =
            state?.placement === "dismissed"
              ? "Re-add to Discovery"
              : "Add to Discovery";
          return (
            <div
              key={album.id}
              className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 hover:bg-[var(--color-bg-highlight)] group"
            >
              <button
                type="button"
                onClick={() => onPlayAlbum?.(album.id)}
                disabled={isLoadingPlay}
                className="relative w-12 h-12 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden cursor-pointer"
                aria-label={`Play ${album.title}`}
              >
                {album.artworkUrl ? (
                  <img
                    src={album.artworkUrl}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3 className="w-6 h-6 text-[var(--color-text-dim)]" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  {isLoadingPlay ? (
                    <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
                  ) : (
                    <Play
                      className="w-5 h-5 text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                      fill="currentColor"
                    />
                  )}
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <Link
                  to="/album/$albumId"
                  params={{ albumId: album.id }}
                  search={{
                    play: undefined,
                    startIndex: undefined,
                    shuffle: undefined,
                  }}
                  className="zune-list-title text-[var(--color-text)] truncate block hover:underline"
                >
                  {album.title}
                </Link>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="zune-eyebrow text-[var(--color-text-dim)]">
                    {album.artist}
                  </span>
                  {album.year ? (
                    <>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        &middot;
                      </span>
                      <span className="zune-eyebrow text-[var(--color-text-dim)]">
                        {String(album.year)}
                      </span>
                    </>
                  ) : null}
                  {album.releaseType && album.releaseType !== "album" ? (
                    <>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        &middot;
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)] px-1.5 py-0.5">
                        {album.releaseType}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {state ? (
                    <SearchPlacementBadge placement={state.placement} />
                  ) : null}
                  {state?.isHot ? <SearchHotBadge /> : null}
                </div>
                {album.genres && album.genres.length > 0 ? (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {album.genres.slice(0, 5).map((genre) => (
                      <span
                        key={genre}
                        className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)]/80 px-1.5 py-0.5"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {onSaveAlbum ? (
                canAdd ? (
                  <button
                    type="button"
                    onClick={() => onSaveAlbum(album.id)}
                    className="text-[10px] sm:text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors shrink-0 w-full sm:w-auto mt-1 sm:mt-0 ml-0 sm:ml-auto"
                  >
                    {actionLabel}
                  </button>
                ) : (
                  <span className="text-[10px] sm:text-xs text-[var(--color-text-dim)] shrink-0 w-full sm:w-auto mt-1 sm:mt-0 text-left sm:text-right">
                    In {formatPlacementLabel(state.placement)}
                  </span>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
