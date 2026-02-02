import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, Plus, Disc3 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { usePlaybackContext } from "../contexts/PlaybackContext";

function shuffle<T>(array: readonly T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j]!, result[i]!];
	}
	return result;
}

const PLAYLIST_COLORS = [
	{ bg: "#1a2e3a", fg: "#06b6d4" },
	{ bg: "#2a1a33", fg: "#a855f7" },
	{ bg: "#2a2510", fg: "#eab308" },
	{ bg: "#0f2518", fg: "#22c55e" },
	{ bg: "#2a1515", fg: "#ef4444" },
	{ bg: "#1a2533", fg: "#3b82f6" },
	{ bg: "#2a1a28", fg: "#ec4899" },
	{ bg: "#1a2a2a", fg: "#14b8a6" },
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
	const cleaned = name.replace(/\s*radio$/i, "").trim();
	return (cleaned[0] ?? "?").toUpperCase();
}

type PlaylistData = {
	readonly id: string;
	readonly name: string;
	readonly artworkUrl?: string | null;
};

function PlaylistCard({
	playlist,
	onPlay,
}: {
	readonly playlist: PlaylistData;
	readonly onPlay: () => void;
}) {
	const color = getPlaylistColor(playlist.name);
	const initial = getPlaylistInitial(playlist.name);

	return (
		<button
			type="button"
			onClick={onPlay}
			className="group cursor-pointer text-left"
		>
			<div
				className="aspect-square rounded-lg mb-2 relative overflow-hidden"
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
							className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
							style={{ background: color.fg, opacity: 0.5 }}
						/>
					</>
				)}
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
					<div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] rounded-full p-2.5 shadow-lg">
						<Play className="w-5 h-5 text-[var(--color-bg)]" fill="currentColor" />
					</div>
				</div>
			</div>
			<p className="text-sm font-medium text-[var(--color-text)] truncate">
				{playlist.name}
			</p>
			<p className="text-xs text-[var(--color-text-dim)]">
				Playlist
			</p>
		</button>
	);
}

type AlbumData = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year: number | null;
	readonly artworkUrl: string | null;
};

function AlbumCard({
	album,
	onPlay,
}: {
	readonly album: AlbumData;
	readonly onPlay: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPlay}
			className="group cursor-pointer text-left"
		>
			<div className="aspect-square bg-[var(--color-bg-highlight)] rounded-lg mb-2 relative overflow-hidden">
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
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
					<div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] rounded-full p-2.5 shadow-lg">
						<Play className="w-5 h-5 text-[var(--color-bg)]" fill="currentColor" />
					</div>
				</div>
			</div>
			<p className="text-sm font-medium text-[var(--color-text)] truncate">
				{album.title}
			</p>
			<p className="text-xs text-[var(--color-text-dim)]">
				{album.artist}
				{album.year ? ` \u00B7 ${String(album.year)}` : ""}
			</p>
		</button>
	);
}

export function HomePage() {
	const navigate = useNavigate();
	const playlistsQuery = trpc.playlist.list.useQuery();
	const albumsQuery = trpc.library.albums.useQuery();

	const playlists = playlistsQuery.data ?? [];
	const albums = useMemo(
		() => shuffle(albumsQuery.data ?? []),
		[albumsQuery.data],
	);

	const handlePlayPlaylist = (playlist: PlaylistData) => {
		navigate({
			to: "/now-playing",
			search: {
				playlist: playlist.id,
			},
		});
	};

	return (
		<div className="flex-1 p-6 space-y-10">
			{/* My Playlists Section */}
			<section>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						My Playlists
					</h2>
					<button
						type="button"
						onClick={() => navigate({ to: "/stations" })}
						className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
					>
						See all
					</button>
				</div>
				{playlistsQuery.isLoading ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
						{Array.from({ length: 5 }, (_, i) => (
							<div key={i}>
								<div className="aspect-square bg-[var(--color-bg-highlight)] rounded-lg mb-2 animate-pulse" />
								<div className="h-4 bg-[var(--color-bg-highlight)] rounded animate-pulse mb-1 w-3/4" />
								<div className="h-3 bg-[var(--color-bg-highlight)] rounded animate-pulse w-1/2" />
							</div>
						))}
					</div>
				) : playlists.length === 0 ? (
					<p className="text-sm text-[var(--color-text-dim)]">
						No playlists found. Create a station to get started.
					</p>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
						{playlists.map((playlist) => (
							<PlaylistCard
								key={playlist.id}
								playlist={playlist}
								onPlay={() => handlePlayPlaylist(playlist)}
							/>
						))}
					</div>
				)}
			</section>

			{/* My Albums Section */}
			<section>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						My Albums
					</h2>
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
					{albums.map((album) => (
						<AlbumCard
							key={album.id}
							album={album}
							onPlay={() => {
								navigate({
									to: "/now-playing",
									search: { album: album.id },
								});
							}}
						/>
					))}
					{/* Add album placeholder */}
					<button
						type="button"
						className="aspect-square border-2 border-dashed border-[var(--color-border)] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-text-dim)] transition-colors"
						onClick={() => navigate({ to: "/search" })}
					>
						<Plus className="w-8 h-8 text-[var(--color-text-dim)] mb-1" />
						<span className="text-xs text-[var(--color-text-dim)]">
							Add album
						</span>
					</button>
				</div>
			</section>
		</div>
	);
}
