import { Play } from "lucide-react";
import { memo } from "react";
import type { PlaylistData } from "./types";

const PLAYLIST_COLOR_CLASSES = [
  {
    background: "bg-playlist-magenta-bg",
    foreground: "text-playlist-magenta-fg",
    foregroundBackground: "bg-playlist-magenta-fg",
  },
  {
    background: "bg-playlist-olive-bg",
    foreground: "text-playlist-olive-fg",
    foregroundBackground: "bg-playlist-olive-fg",
  },
  {
    background: "bg-playlist-amber-bg",
    foreground: "text-playlist-amber-fg",
    foregroundBackground: "bg-playlist-amber-fg",
  },
  {
    background: "bg-playlist-ice-bg",
    foreground: "text-playlist-ice-fg",
    foregroundBackground: "bg-playlist-ice-fg",
  },
  {
    background: "bg-playlist-rose-bg",
    foreground: "text-playlist-rose-fg",
    foregroundBackground: "bg-playlist-rose-fg",
  },
  {
    background: "bg-playlist-violet-bg",
    foreground: "text-playlist-violet-fg",
    foregroundBackground: "bg-playlist-violet-fg",
  },
  {
    background: "bg-playlist-clay-bg",
    foreground: "text-playlist-clay-fg",
    foregroundBackground: "bg-playlist-clay-fg",
  },
  {
    background: "bg-playlist-teal-bg",
    foreground: "text-playlist-teal-fg",
    foregroundBackground: "bg-playlist-teal-fg",
  },
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getPlaylistColor(name: string) {
  const index = hashString(name) % PLAYLIST_COLOR_CLASSES.length;
  return PLAYLIST_COLOR_CLASSES[index] ?? PLAYLIST_COLOR_CLASSES[0];
}

function getPlaylistInitial(name: string): string {
  const cleaned = name.replace(/s*radio$/i, "").trim();
  return (cleaned[0] ?? "?").toUpperCase();
}

type PlaylistCardProps = {
  readonly playlist: PlaylistData;
  readonly onPlay: () => void;
};

export const PlaylistCard = memo(function PlaylistCard({
  playlist,
  onPlay,
}: PlaylistCardProps) {
  const color = getPlaylistColor(playlist.name);
  const initial = getPlaylistInitial(playlist.name);

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group cursor-pointer text-left w-full"
    >
      <div
        className={`aspect-square mb-2 relative overflow-hidden ${playlist.artworkUrl ? "" : color.background}`}
      >
        {playlist.artworkUrl ? (
          <img
            src={playlist.artworkUrl}
            alt={playlist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <span
              className={`absolute -bottom-3 left-1.5 text-7xl font-black leading-none -tracking-widest select-none opacity-15 ${color.foreground}`}
            >
              {initial}
            </span>
            <div
              className={`absolute top-2.5 right-2.5 w-2 h-2 opacity-50 ${color.foregroundBackground}`}
            />
          </>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-pyxis-primary p-2.5">
            <Play className="w-5 h-5 text-white" fill="currentColor" />
          </div>
        </div>
      </div>
      <p className="zune-title text-ui-base text-pyxis-text truncate">
        {playlist.name}
      </p>
      <p className="zune-meta text-pyxis-dim">playlist</p>
    </button>
  );
});
