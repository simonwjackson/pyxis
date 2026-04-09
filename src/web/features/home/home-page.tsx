/**
 * @module HomePage
 * Placement-aware home page with Hot, Discovery, and Collection shelves.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, memo, useState } from "react";
import {
	Play,
	Plus,
	Disc3,
	Shuffle,
	ArrowDownAZ,
	Clock,
	Flame,
} from "lucide-react";
import { trpc } from "@/web/shared/lib/trpc";
import { CollectionGrid, type SortOption } from "@/web/shared/ui/collection-grid";
import {
	formatPlacementLabel,
	hotBadgeClassName,
	placementBadgeClassName,
	type AlbumPlacement,
} from "@/web/shared/lib/library-placement";

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
		<button type="button" onClick={onPlay} className="group cursor-pointer text-left w-full">
			<div
				className="aspect-square mb-2 relative overflow-hidden"
				style={playlist.artworkUrl ? undefined : { background: color.bg }}
			>
				{playlist.artworkUrl ? (
					<img src={playlist.artworkUrl} alt={playlist.name} className="w-full h-full object-cover" />
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
			<p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">{playlist.name}</p>
			<p className="zune-meta text-[var(--color-text-dim)]">playlist</p>
		</button>
	);
});

type AlbumData = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year: number | null;
	readonly artworkUrl: string | null;
	readonly placement: AlbumPlacement;
	readonly isHot: boolean;
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
					<img src={album.artworkUrl} alt={album.title} className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<Disc3 className="w-12 h-12 text-[var(--color-text-dim)]" />
					</div>
				)}
				<div className="absolute top-2 left-2 flex gap-1 flex-wrap">
					<span className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(album.placement)}`}>
						{formatPlacementLabel(album.placement)}
					</span>
					{album.isHot ? (
						<span className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}>
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
			<p className="zune-title text-[0.95rem] text-[var(--color-text)] truncate">{album.title}</p>
			<p className="zune-meta text-[var(--color-text-dim)]">
				{album.artist}
				{album.year ? ` · ${String(album.year)}` : ""}
			</p>
		</Link>
	);
});

function AlbumShelf({
	title,
	albums,
	emptyMessage,
	headerAction,
	trailing,
}: {
	readonly title: string;
	readonly albums: readonly AlbumData[];
	readonly emptyMessage: string;
	readonly headerAction?: React.ReactNode;
	readonly trailing?: React.ReactNode;
}) {
	return (
		<section>
			<div className="flex items-end justify-between mb-5">
				<div className="flex items-baseline gap-4">
					<h2 className="zune-display zune-page-title text-[var(--color-text)]">{title}</h2>
					<span className="zune-label zune-data text-[var(--color-text-dim)]">{String(albums.length)}</span>
				</div>
				<div>{headerAction}</div>
			</div>
			{albums.length === 0 ? (
				<p className="text-sm text-[var(--color-text-dim)]">{emptyMessage}</p>
			) : (
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
					{albums.map((album) => (
						<div key={album.id}>
							<AlbumCard album={album} />
						</div>
					))}
					{trailing}
				</div>
			)}
		</section>
	);
}

const PLAYLIST_SORT_OPTIONS: readonly SortOption<PlaylistData>[] = [
	{ key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
	{ key: "az", label: "A → Z", icon: ArrowDownAZ, comparator: (a, b) => a.name.localeCompare(b.name) },
	{ key: "recent", label: "Recently Added", icon: Clock, comparator: (a, b) => b.id.localeCompare(a.id) },
] as const;

const filterPlaylist = (playlist: PlaylistData, query: string) => playlist.name.toLowerCase().includes(query);

export function HomePage() {
	const navigate = useNavigate();
	const [showArchive, setShowArchive] = useState(false);
	const playlistsQuery = trpc.playlist.list.useQuery();
	const hotQuery = trpc.library.hotAlbums.useQuery({ includeDismissed: true, limit: 10 });
	const discoveryQuery = trpc.library.albums.useQuery({ placements: ["discovery"] });
	const collectionQuery = trpc.library.albums.useQuery({ placements: ["collection"] });
	const archiveQuery = trpc.library.albums.useQuery(
		{ placements: ["archive"] },
		{ enabled: showArchive },
	);

	const playlists = playlistsQuery.data ?? [];
	const toAlbumData = useCallback(
		(albums: readonly {
			id: string;
			title: string;
			artist: string;
			year?: number | null;
			artworkUrl?: string | null;
			placement: AlbumPlacement;
			isHot: boolean;
		}[]) =>
			albums.map((album) => ({
				id: album.id,
				title: album.title,
				artist: album.artist,
				year: album.year ?? null,
				artworkUrl: album.artworkUrl ?? null,
				placement: album.placement,
				isHot: album.isHot,
			})),
		[],
	);

	const hotAlbums = toAlbumData(hotQuery.data ?? []);
	const discoveryAlbums = toAlbumData(discoveryQuery.data ?? []);
	const collectionAlbums = toAlbumData(collectionQuery.data ?? []);
	const archiveAlbums = toAlbumData(archiveQuery.data ?? []);

	const handleOpenPlaylist = useCallback(
		(playlist: PlaylistData) => {
			if (playlist.id.startsWith("pandora:")) {
				navigate({ to: "/station/$token", params: { token: playlist.id }, search: { play: undefined } });
			} else {
				navigate({
					to: "/playlist/$playlistId",
					params: { playlistId: playlist.id },
					search: { play: undefined, startIndex: undefined, shuffle: undefined },
				});
			}
		},
		[navigate],
	);

	const renderPlaylistItem = useCallback(
		(playlist: PlaylistData) => <PlaylistCard playlist={playlist} onPlay={() => handleOpenPlaylist(playlist)} />,
		[handleOpenPlaylist],
	);

	return (
		<div className="flex-1 px-8 py-10 space-y-16">
			{playlistsQuery.isLoading ? (
				<CollectionGrid.Skeleton title="my playlists" />
			) : playlists.length === 0 ? (
				<CollectionGrid.Empty title="my playlists" message="No playlists found. Create a station to get started." />
			) : (
				<CollectionGrid
					title="my playlists"
					items={playlists}
					keyOf={(playlist) => playlist.id}
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

			{hotQuery.isLoading ? (
				<CollectionGrid.Skeleton title="Hot" />
			) : (
				<AlbumShelf
					title="Hot"
					albums={hotAlbums}
					emptyMessage="Nothing hot yet. Listen to an album a few times and it will surface here."
				/>
			)}

			{discoveryQuery.isLoading ? (
				<CollectionGrid.Skeleton title="Discovery" />
			) : (
				<AlbumShelf
					title="Discovery"
					albums={discoveryAlbums}
					emptyMessage="Nothing in discovery yet. Add an album to get started."
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

			{collectionQuery.isLoading ? (
				<CollectionGrid.Skeleton title="Collection" />
			) : (
				<AlbumShelf
					title="Collection"
					albums={collectionAlbums}
					emptyMessage="Nothing in collection yet. Move albums here when they become keepers."
					headerAction={
						<button
							type="button"
							onClick={() => setShowArchive((value) => !value)}
							className="zune-label text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
						>
							{showArchive ? "hide archive" : "show archive"}
						</button>
					}
				/>
			)}

			{showArchive ? (
				archiveQuery.isLoading ? (
					<CollectionGrid.Skeleton title="Archive" />
				) : (
					<AlbumShelf title="Archive" albums={archiveAlbums} emptyMessage="Archive is empty." />
				)
			) : null}
		</div>
	);
}
