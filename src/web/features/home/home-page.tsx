/**
 * @module HomePage
 * Placement-aware home page with Hot, Discovery, and Collection shelves.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, memo, useMemo, useState } from "react";
import {
	Play,
	Plus,
	Disc3,
	Shuffle,
	ArrowDownAZ,
	Clock,
	Flame,
	Search,
	ChevronLeft,
	ChevronRight,
	User,
	ArrowDownWideNarrow,
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
	readonly placementUpdatedAt: number;
	readonly isHot: boolean;
	readonly hotRank: number | null;
};

function shuffleAlbums(albums: readonly AlbumData[]): AlbumData[] {
	const result = [...albums];
	for (let index = result.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
	}
	return result;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}
	const pages: (number | "ellipsis")[] = [1];
	if (currentPage > 3) pages.push("ellipsis");
	const start = Math.max(2, currentPage - 1);
	const end = Math.min(totalPages - 1, currentPage + 1);
	for (let page = start; page <= end; page++) pages.push(page);
	if (currentPage < totalPages - 2) pages.push("ellipsis");
	pages.push(totalPages);
	return pages;
}

type AlbumSortOption = {
	readonly key: string;
	readonly label: string;
	readonly icon: React.ComponentType<{ className?: string }>;
	readonly comparator: ((a: AlbumData, b: AlbumData) => number) | "shuffle";
};

const ALBUM_SORT_OPTIONS: readonly AlbumSortOption[] = [
	{ key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
	{ key: "az", label: "A → Z", icon: ArrowDownAZ, comparator: (a, b) => a.title.localeCompare(b.title) },
	{
		key: "artist",
		label: "By Artist",
		icon: User,
		comparator: (a, b) => {
			const artistCompare = a.artist.localeCompare(b.artist);
			return artistCompare !== 0 ? artistCompare : a.title.localeCompare(b.title);
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
	{
		key: "recent",
		label: "Recently Added",
		icon: Clock,
		comparator: (a, b) => b.placementUpdatedAt - a.placementUpdatedAt,
	},
] as const;

const HOT_SORT_OPTIONS: readonly AlbumSortOption[] = [
	{
		key: "hot",
		label: "Hot Rank",
		icon: Flame,
		comparator: (a, b) => {
			const aRank = a.hotRank ?? Number.MAX_SAFE_INTEGER;
			const bRank = b.hotRank ?? Number.MAX_SAFE_INTEGER;
			if (aRank !== bRank) return aRank - bRank;
			return b.placementUpdatedAt - a.placementUpdatedAt;
		},
	},
	...ALBUM_SORT_OPTIONS,
] as const;

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
	sortOptions = ALBUM_SORT_OPTIONS,
	defaultSort = "recent",
	pageSize = 10,
}: {
	readonly title: string;
	readonly albums: readonly AlbumData[];
	readonly emptyMessage: string;
	readonly headerAction?: React.ReactNode;
	readonly trailing?: React.ReactNode;
	readonly sortOptions?: readonly AlbumSortOption[];
	readonly defaultSort?: string;
	readonly pageSize?: number;
}) {
	const [filterText, setFilterText] = useState("");
	const [currentSort, setCurrentSort] = useState(defaultSort);
	const [currentPage, setCurrentPage] = useState(1);

	const filteredAlbums = useMemo(() => {
		const normalizedFilter = filterText.trim().toLowerCase();
		if (!normalizedFilter) return albums;
		return albums.filter((album) => {
			return album.title.toLowerCase().includes(normalizedFilter) || album.artist.toLowerCase().includes(normalizedFilter);
		});
	}, [albums, filterText]);

	const sortedAlbums = useMemo(() => {
		const selected = sortOptions.find((option) => option.key === currentSort) ?? sortOptions[0];
		if (!selected) return [...filteredAlbums];
		if (selected.comparator === "shuffle") {
			return shuffleAlbums(filteredAlbums);
		}
		return [...filteredAlbums].sort(selected.comparator);
	}, [currentSort, filteredAlbums, sortOptions]);

	const totalPages = Math.max(1, Math.ceil(sortedAlbums.length / pageSize));
	const safePage = Math.min(currentPage, totalPages);
	const startIndex = (safePage - 1) * pageSize;
	const pageAlbums = sortedAlbums.slice(startIndex, startIndex + pageSize);
	const showPagination = totalPages > 1;

	return (
		<section>
			<div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
				<div className="flex items-baseline gap-4">
					<h2 className="zune-display zune-page-title text-[var(--color-text)]">{title}</h2>
					<span className="zune-label zune-data text-[var(--color-text-dim)]">
						{filterText ? `${String(sortedAlbums.length)} of ${String(albums.length)}` : String(albums.length)}
					</span>
				</div>
				<div className="flex items-center gap-3 flex-wrap">
					{headerAction}
					<div className="relative">
						<label htmlFor={`${title}-filter`} className="sr-only">Filter {title}</label>
						<input
							id={`${title}-filter`}
							type="text"
							placeholder="filter..."
							value={filterText}
							onChange={(event) => {
								setFilterText(event.target.value);
								setCurrentPage(1);
							}}
							className="bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-[var(--color-text)] py-1.5 pl-8 pr-3 text-[13px] w-[180px] outline-none focus:border-[var(--color-border-active)] transition-colors placeholder:text-[var(--color-text-dim)]"
						/>
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] w-4 h-4" aria-hidden="true" />
					</div>
				</div>
			</div>

			<div className="flex gap-1.5 mb-6 flex-wrap" role="group" aria-label={`${title} sort options`}>
				{sortOptions.map((option) => {
					const Icon = option.icon;
					const isActive = currentSort === option.key;
					return (
						<button
							key={option.key}
							type="button"
							aria-pressed={isActive}
							onClick={() => {
								setCurrentSort(option.key);
								setCurrentPage(1);
							}}
							className={
								isActive
									? "bg-[var(--color-bg-elevated)] text-[var(--color-text)] py-1 px-3.5 text-xs font-medium inline-flex items-center gap-1.5"
									: "bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] py-1 px-3.5 text-xs inline-flex items-center gap-1.5 hover:text-[var(--color-text)] hover:border-[var(--color-text-dim)] transition-colors"
							}
						>
							<Icon className="w-[13px] h-[13px]" aria-hidden="true" />
							{option.label}
						</button>
					);
				})}
			</div>

			{sortedAlbums.length === 0 ? (
				<p className="text-sm text-[var(--color-text-dim)]">{emptyMessage}</p>
			) : (
				<>
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
						{pageAlbums.map((album) => (
							<div key={album.id}>
								<AlbumCard album={album} />
							</div>
						))}
						{safePage === totalPages ? trailing : null}
					</div>

					{showPagination ? (
						<nav className="flex items-center justify-between mt-8 pt-5 border-t border-[var(--color-border)]" aria-label={`${title} pagination`}>
							<span className="zune-label zune-data text-[var(--color-text-dim)] opacity-60">
								page {String(safePage)} of {String(totalPages)}
							</span>
							<div className="flex gap-1 items-center">
								<button
									type="button"
									disabled={safePage === 1}
									onClick={() => setCurrentPage(safePage - 1)}
									className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
									aria-label="Previous page"
								>
									<ChevronLeft className="w-4 h-4" aria-hidden="true" />
								</button>
								{getPageNumbers(safePage, totalPages).map((page, index) =>
									page === "ellipsis" ? (
										<span key={`ellipsis-${String(index)}`} className="text-[var(--color-border)] text-xs px-0.5" aria-hidden="true">...</span>
									) : (
										<button
											key={page}
											type="button"
											onClick={() => setCurrentPage(page)}
											className={
												page === safePage
													? "bg-[var(--color-bg-elevated)] text-[var(--color-text)] min-w-[28px] h-7 text-xs font-medium"
													: "bg-[var(--color-bg-highlight)] text-[var(--color-text-dim)] min-w-[28px] h-7 text-xs hover:text-[var(--color-text)] transition-colors"
											}
											aria-current={page === safePage ? "page" : undefined}
										>
											{String(page)}
										</button>
									),
								)}
								<button
									type="button"
									disabled={safePage === totalPages}
									onClick={() => setCurrentPage(safePage + 1)}
									className="bg-[var(--color-bg-highlight)] w-7 h-7 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
									aria-label="Next page"
								>
									<ChevronRight className="w-4 h-4" aria-hidden="true" />
								</button>
							</div>
						</nav>
					) : null}
				</>
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
			placementUpdatedAt: number;
			isHot: boolean;
			hotRank: number | null;
		}[]) =>
			albums.map((album) => ({
				id: album.id,
				title: album.title,
				artist: album.artist,
				year: album.year ?? null,
				artworkUrl: album.artworkUrl ?? null,
				placement: album.placement,
				placementUpdatedAt: album.placementUpdatedAt,
				isHot: album.isHot,
				hotRank: album.hotRank,
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
					sortOptions={HOT_SORT_OPTIONS}
					defaultSort="hot"
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
