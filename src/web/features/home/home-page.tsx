/**
 * @module HomePage
 * Zune-inspired home page with panoramic headers and collection grids.
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

type PlaylistData = {
	readonly id: string;
	readonly name: string;
	readonly artworkUrl?: string | null;
};

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
			<p className="zune-meta text-[var(--color-text-dim)]">
				playlist
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
				{album.year ? ` \u00B7 ${String(album.year)}` : ""}
			</p>
		</Link>
	);
});

const PLAYLIST_SORT_OPTIONS: readonly SortOption<PlaylistData>[] = [
	{ key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
	{ key: "az", label: "A \u2192 Z", icon: ArrowDownAZ, comparator: (a, b) => a.name.localeCompare(b.name) },
	{ key: "recent", label: "Recently Added", icon: Clock, comparator: (a, b) => b.id.localeCompare(a.id) },
] as const;

const ALBUM_SORT_OPTIONS: readonly SortOption<AlbumData>[] = [
	{ key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
	{ key: "az", label: "A \u2192 Z", icon: ArrowDownAZ, comparator: (a, b) => a.title.localeCompare(b.title) },
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
			if (a.year === null && b.year === null) return 0;
			if (a.year === null) return 1;
			if (b.year === null) return -1;
			return b.year - a.year;
		},
	},
	{ key: "recent", label: "Recently Added", icon: Clock, comparator: (a, b) => b.id.localeCompare(a.id) },
] as const;

const filterPlaylist = (p: PlaylistData, q: string) => p.name.toLowerCase().includes(q);
const filterAlbum = (a: AlbumData, q: string) => {
	const lower = q.toLowerCase();
	return a.title.toLowerCase().includes(lower) || a.artist.toLowerCase().includes(lower);
};

export function HomePage() {
	const navigate = useNavigate();
	const playlistsQuery = trpc.playlist.list.useQuery();
	const albumsQuery = trpc.library.albums.useQuery();

	const playlists = playlistsQuery.data ?? [];
	const albums: readonly AlbumData[] = (albumsQuery.data ?? []).map((album) => ({
		id: album.id,
		title: album.title,
		artist: album.artist,
		year: album.year ?? null,
		artworkUrl: album.artworkUrl ?? null,
	}));

	const handleOpenPlaylist = useCallback((playlist: PlaylistData) => {
		if (playlist.id.startsWith("pandora:")) {
			navigate({ to: "/station/$token", params: { token: playlist.id }, search: { play: undefined } });
		} else {
			navigate({ to: "/playlist/$playlistId", params: { playlistId: playlist.id }, search: { play: undefined, startIndex: undefined, shuffle: undefined } });
		}
	}, [navigate]);

	const renderPlaylistItem = useCallback((playlist: PlaylistData) => (
		<PlaylistCard playlist={playlist} onPlay={() => handleOpenPlaylist(playlist)} />
	), [handleOpenPlaylist]);

	const renderAlbumItem = useCallback((album: AlbumData) => (
		<AlbumCard album={album} />
	), []);

	return (
		<div className="flex-1 px-8 py-10 space-y-16">
			{playlistsQuery.isLoading ? (
				<CollectionGrid.Skeleton title="my playlists" />
			) : playlists.length === 0 ? (
				<CollectionGrid.Empty
					title="my playlists"
					message="No playlists found. Create a station to get started."
				/>
			) : (
				<CollectionGrid
					title="my playlists"
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
							className="zune-label text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							see all
						</button>
					}
				/>
			)}

			{albumsQuery.isLoading ? (
				<CollectionGrid.Skeleton title="my albums" />
			) : albums.length === 0 ? (
				<CollectionGrid.Empty
					title="my albums"
					message="No albums found."
				/>
			) : (
				<CollectionGrid
					title="my albums"
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
							className="aspect-square border border-dashed border-[var(--color-border)] flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-text-dim)] transition-colors"
							onClick={() => navigate({ to: "/search" })}
							aria-label="Add album"
						>
							<Plus className="w-8 h-8 text-[var(--color-text-dim)] mb-1" aria-hidden="true" />
							<span className="zune-meta text-[var(--color-text-dim)]">add album</span>
						</button>
					}
				/>
			)}
		</div>
	);
}
