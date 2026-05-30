import { formatPlacementLabel } from "@app/shared/lib/libraryPlacement";
import { Link } from "@tanstack/react-router";
import { Disc3, Loader2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { SearchAlbumState, type SearchAlbum } from "../types";
import { SearchHotBadge } from "./SearchHotBadge";
import { SearchPlacementBadge } from "./SearchPlacementBadge";

type SearchAlbumRowProps = {
  readonly album: SearchAlbum;
  readonly isLoadingPlay: boolean;
  readonly onPlayAlbum: ((albumId: string) => void) | undefined;
  readonly onSaveAlbum: ((albumId: string) => void) | undefined;
};

export function SearchAlbumRow({
  album,
  isLoadingPlay,
  onPlayAlbum,
  onSaveAlbum,
}: SearchAlbumRowProps) {
  const libraryState = album.state;
  const canAdd = SearchAlbumState.canAdd(libraryState);

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 hover:bg-pyxis-highlight group">
      <SearchAlbumPlayButton
        album={album}
        isLoadingPlay={isLoadingPlay}
        onPlayAlbum={onPlayAlbum}
      />
      <SearchAlbumSummary album={album} />
      <SearchAlbumAction
        albumId={album.id}
        libraryState={libraryState}
        canAdd={canAdd}
        onSaveAlbum={onSaveAlbum}
      />
    </div>
  );
}

function SearchAlbumPlayButton({
  album,
  isLoadingPlay,
  onPlayAlbum,
}: Pick<SearchAlbumRowProps, "album" | "isLoadingPlay" | "onPlayAlbum">) {
  return (
    <button
      type="button"
      onClick={() => onPlayAlbum?.(album.id)}
      disabled={isLoadingPlay}
      className="relative w-12 h-12 bg-pyxis-highlight flex items-center justify-center shrink-0 overflow-hidden cursor-pointer"
      aria-label={`Play ${album.title}`}
    >
      {album.artworkUrl ? (
        <img
          src={album.artworkUrl}
          alt={album.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <Disc3 className="w-6 h-6 text-pyxis-dim" />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        {isLoadingPlay ? (
          <Loader2 className="w-5 h-5 text-pyxis-primary animate-spin" />
        ) : (
          <Play
            className="w-5 h-5 text-pyxis-primary opacity-0 group-hover:opacity-100 transition-opacity"
            fill="currentColor"
          />
        )}
      </div>
    </button>
  );
}

function SearchAlbumSummary({ album }: { readonly album: SearchAlbum }) {
  return (
    <div className="flex-1 min-w-0">
      <Link
        to="/album/$albumId"
        params={{ albumId: album.id }}
        search={{ play: undefined, startIndex: undefined, shuffle: undefined }}
        className="zune-list-title text-pyxis-text truncate block hover:underline"
      >
        {album.title}
      </Link>
      <SearchAlbumMeta album={album} />
      <SearchAlbumLibraryBadges state={album.state} />
      <SearchAlbumGenres genres={album.genres} />
    </div>
  );
}

function SearchAlbumMeta({ album }: { readonly album: SearchAlbum }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="zune-eyebrow text-pyxis-dim">{album.artist}</span>
      {album.year ? <SearchAlbumMetaItem>{String(album.year)}</SearchAlbumMetaItem> : null}
      {album.releaseType && album.releaseType !== "album" ? (
        <SearchAlbumMetaItem>
          <span className="zune-badge text-pyxis-muted bg-pyxis-highlight px-1.5 py-0.5">
            {album.releaseType}
          </span>
        </SearchAlbumMetaItem>
      ) : null}
    </div>
  );
}

function SearchAlbumMetaItem({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <span className="text-xs text-pyxis-muted">&middot;</span>
      <span className="zune-eyebrow text-pyxis-dim">{children}</span>
    </>
  );
}

function SearchAlbumLibraryBadges({
  state,
}: {
  readonly state: SearchAlbum["state"];
}) {
  if (!state) return null;
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      <SearchPlacementBadge placement={SearchAlbumState.placement(state)} />
      {SearchAlbumState.isHot(state) ? <SearchHotBadge /> : null}
    </div>
  );
}

function SearchAlbumGenres({
  genres,
}: {
  readonly genres: SearchAlbum["genres"];
}) {
  if (!genres || genres.length === 0) return null;
  return (
    <div className="flex gap-1 mt-2 flex-wrap">
      {genres.slice(0, 5).map((genre) => (
        <span
          key={genre}
          className="text-ui-xs text-pyxis-muted bg-pyxis-highlight/80 px-1.5 py-0.5"
        >
          {genre}
        </span>
      ))}
    </div>
  );
}

function SearchAlbumAction({
  albumId,
  libraryState,
  canAdd,
  onSaveAlbum,
}: {
  readonly albumId: string;
  readonly libraryState: SearchAlbum["state"];
  readonly canAdd: boolean;
  readonly onSaveAlbum: ((albumId: string) => void) | undefined;
}) {
  if (!onSaveAlbum) return null;
  if (canAdd) {
    return (
      <button
        type="button"
        onClick={() => onSaveAlbum(albumId)}
        className="text-ui-xs text-pyxis-muted hover:text-pyxis-text bg-pyxis-highlight hover:bg-pyxis-border px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors shrink-0 w-full sm:w-auto mt-1 sm:mt-0 ml-0 sm:ml-auto"
      >
        {SearchAlbumState.actionLabel(libraryState)}
      </button>
    );
  }
  if (!libraryState) return null;
  return (
    <span className="text-ui-xs text-pyxis-dim shrink-0 w-full sm:w-auto mt-1 sm:mt-0 text-left sm:text-right">
      In {formatPlacementLabel(SearchAlbumState.placement(libraryState))}
    </span>
  );
}
