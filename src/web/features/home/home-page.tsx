/**
 * @module HomePage
 * Main home page displaying user's playlists and albums.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, memo } from "react";
import {
	Play,
	Plus,
	Disc3,
	Shuffle,
	ArrowDownAZ,
	User,
	ArrowDownWideNarrow,
	Clock,
} from "lucide-react";
import { trpc } from "@/web/shared/lib/trpc";
import {
	CollectionGrid,
	type SortOption,
} from "@/web/shared/ui/collection-grid";

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
	const cleaned = name.replace(/s*radio$/i, "").trim();
	return (cleaned[0] ?? "?").toUpperCase();
}

type PlaylistData = {
	readonly id: string;
	readonly name: string;
	readonly artworkUrl?: string | null;
};

/**
 * Card component for displaying a playlist with play-on-click.
 */
const PlaylistCard = memo(function PlaylistCard({
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
			className="group cursor-pointer text-left w-full"
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
});

type AlbumData = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year: number | null;
	readonly artworkUrl: string | null;
};

/**
 * Card component for displaying an album with link to detail page.
 */
const AlbumCard = memo(function AlbumCard({
	album,
}: {
	readonly album: AlbumData;
}) {
	return (
		<Link
			to="/album/$albumId"
			params={{ albumId: album.id }}
			search={{ play: undefined, startIndex: undefined, shuffle: undefined }}
			className="group cursor-pointer text-left w-full block"
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
		</Link>
	);
});

const PLAYLIST_SORT_OPTIONS: readonly SortOption<PlaylistData>[] = [
	{
		key: "shuffle",
		label: "Shuffle",
		icon: Shuffle,
		comparator: "shuffle",
	},
	{
		key: "az",
		label: "A \u2192 Z",
		icon: ArrowDownAZ,
		comparator: (a, b) => a.name.localeCompare(b.name),
	},
	{
		key: "recent",
		label: "Recently Added",
		icon: Clock,
		comparator: (a, b) => b.id.localeCompare(a.id),
	},
] as const;

const ALBUM_SORT_OPTIONS: readonly SortOption<AlbumData>[] = [
	{
		key: "shuffle",
		label: "Shuffle",
		icon: Shuffle,
		comparator: "shuffle",
	},
	{
		key: "az",
		label: "A \u2192 Z",
		icon: ArrowDownAZ,
		comparator: (a, b) => a.title.localeCompare(b.title),
	},
	{
		key: "artist",
		label: "By Artist",
		icon: User,
		comparator: (a, b) => {
			const c = a.artist.localeCompare(b.artist);
			return c !== 0 ? c : a.title.localeCompare(b.title);
		},
	},
	{
		key: "newest",
		label: "Newest",
		icon: ArrowDownWideNarrow,
		comparator: (a, b) => {
			// nulls last
			if (a.year === null && b.year === null) return 0;
			if (a.year === null) return 1;
			if (b.year === null) return -1;
			return b.year - a.year;
		},
	},
	{
		key: "recent",
		label: "Recently Added",
		icon: Clock,
		comparator: (a, b) => b.id.localeCompare(a.id),
	},
] as const;

// Static filter functions - defined outside component to avoid recreation
const filterPlaylist = (p: PlaylistData, q: string) => p.name.toLowerCase().includes(q);
const filterAlbum = (a: AlbumData, q: string) => {
	const lower = q.toLowerCase();
	return a.title.toLowerCase().includes(lower) || a.artist.toLowerCase().includes(lower);
};

/**
 * Home page component displaying user's playlists and albums.
 */
export function HomePage() {
	const navigate = useNavigate();
	const playlistsQuery = trpc.playlist.list.useQuery();
	const albumsQuery = trpc.library.albums.useQuery();

	const playlists = playlistsQuery.data ?? [];
	const albums = albumsQuery.data ?? [];

	const handleOpenPlaylist = useCallback((playlist: PlaylistData) => {
		if (playlist.id.startsWith("pandora:")) {
			navigate({
				to: "/station/$token",
				params: { token: playlist.id },
				search: { play: undefined, startIndex: undefined, shuffle: undefined },
			});
		} else {
			navigate({
				to: "/playlist/$playlistId",
				params: { playlistId: playlist.id },
				search: { play: undefined, startIndex: undefined, shuffle: undefined },
			});
		}
	}, [navigate]);

	const renderPlaylistItem = useCallback((playlist: PlaylistData) => (
		<PlaylistCard
			playlist={playlist}
			onPlay={() => handleOpenPlaylist(playlist)}
		/>
	), [handleOpenPlaylist]);

	const renderAlbumItem = useCallback((album: AlbumData) => (
		<AlbumCard album={album} />
	), []);

	return (
		<div className="flex-1 p-6 space-y-10">
			{playlistsQuery.isLoading ? (
				<CollectionGrid.Skeleton title="My Playlists" />
			) : playlists.length === 0 ? (
				<CollectionGrid.Empty
					title="My Playlists"
					message="No playlists found. Create a station to get started."
				/>
			) : (
				<CollectionGrid
					title="My Playlists"
					items={playlists}
					keyOf={(p) => p.id}
					renderItem={renderPlaylistItem}
					filterFn={filterPlaylist}
					sortOptions={PLAYLIST_SORT_OPTIONS}
					defaultSort="shuffle"
					paramPrefix="pl"
					headerActions={
						<button
							type="button"
							onClick={() => navigate({ to: "/stations" })}
							className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							See all
						</button>
					}
				/>
			)}

			{albumsQuery.isLoading ? (
				<CollectionGrid.Skeleton title="My Albums" />
			) : albums.length === 0 ? (
				<CollectionGrid.Empty
					title="My Albums"
					message="No albums found."
				/>
			) : (
				<CollectionGrid
					title="My Albums"
					items={albums}
					keyOf={(a) => a.id}
					renderItem={renderAlbumItem}
					filterFn={filterAlbum}
					sortOptions={ALBUM_SORT_OPTIONS}
					defaultSort="shuffle"
					paramPrefix="al"
					trailing={
						<button
							type="button"
							className="aspect-square border-2 border-dashed border-[var(--color-border)] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-text-dim)] transition-colors"
							onClick={() => navigate({ to: "/search" })}
							aria-label="Add album"
						>
							<Plus className="w-8 h-8 text-[var(--color-text-dim)] mb-1" aria-hidden="true" />
							<span className="text-xs text-[var(--color-text-dim)]">
								Add album
							</span>
						</button>
					}
				/>
			)}
		</div>
	);
}
