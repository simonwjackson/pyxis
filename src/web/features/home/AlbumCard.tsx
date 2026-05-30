import { Link } from "@tanstack/react-router";
import { Disc3, Play } from "lucide-react";
import { memo } from "react";
import {
  formatPlacementLabel,
  hotBadgeClassName,
  placementBadgeClassName,
} from "@app/shared/lib/libraryPlacement";
import type { AlbumData } from "./types";

type AlbumCardProps = {
  readonly album: AlbumData;
};

export const AlbumCard = memo(function AlbumCard({ album }: AlbumCardProps) {
  return (
    <Link
      to="/album/$albumId"
      params={{ albumId: album.id }}
      search={{ play: undefined, startIndex: undefined, shuffle: undefined }}
      className="group cursor-pointer text-left w-full block"
    >
      <div className="aspect-square bg-[var(--color-bg-highlight)] mb-2 relative overflow-hidden">
        {album.artworkUrl ? (
          <img
            src={album.artworkUrl}
            alt={album.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-12 h-12 text-[var(--color-text-dim)]" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
          <span
            className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(album.placement)}`}
          >
            {formatPlacementLabel(album.placement)}
          </span>
          {album.isHot ? (
            <span
              className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}
            >
              Hot
            </span>
          ) : null}
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] p-2.5">
            <Play className="w-5 h-5 text-white" fill="currentColor" />
          </div>
        </div>
      </div>
      <p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">
        {album.title}
      </p>
      <p className="zune-meta text-[var(--color-text-dim)]">
        {album.artist}
        {album.year ? ` · ${String(album.year)}` : ""}
      </p>
    </Link>
  );
});
