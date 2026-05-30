import { Play } from "lucide-react";
import { memo } from "react";
import type { PlaylistData } from "./types";

const PLAYLIST_COLORS = [
  { bg: "#2a1e22", fg: "#d4377b" },
  { bg: "#1e2a1e", fg: "#8b9a3e" },
  { bg: "#2a2518", fg: "#e8a849" },
  { bg: "#1e2428", fg: "#6ba3be" },
  { bg: "#2a1e1e", fg: "#c94040" },
  { bg: "#22202a", fg: "#9a7bbf" },
  { bg: "#2a2520", fg: "#be8a6b" },
  { bg: "#1e2a28", fg: "#5caa8e" },
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getPlaylistColor(name: string) {
  return PLAYLIST_COLORS[hashString(name) % PLAYLIST_COLORS.length]!;
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
        className="aspect-square mb-2 relative overflow-hidden"
        style={playlist.artworkUrl ? undefined : { background: color.bg }}
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
              className="absolute -bottom-3 left-1.5 text-[80px] font-black leading-none -tracking-widest select-none"
              style={{ color: color.fg, opacity: 0.15 }}
            >
              {initial}
            </span>
            <div
              className="absolute top-2.5 right-2.5 w-2 h-2"
              style={{ background: color.fg, opacity: 0.5 }}
            />
          </>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] p-2.5">
            <Play className="w-5 h-5 text-white" fill="currentColor" />
          </div>
        </div>
      </div>
      <p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">
        {playlist.name}
      </p>
      <p className="zune-meta text-[var(--color-text-dim)]">playlist</p>
    </button>
  );
});
