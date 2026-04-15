/**
 * @module HomePage
 * Placement-aware home page with Hot, Discovery, and Collection shelves.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { trpc } from "@/web/shared/lib/trpc";
import type { AlbumPlacement } from "@/web/shared/lib/library-placement";
import { CollectionGridSkeleton } from "@/web/shared/ui/collection-grid/CollectionGridSkeleton";
import { AlbumShelf, HOT_SORT_OPTIONS } from "./album-shelf";
import { PlaylistShelf } from "./playlist-shelf";
import type { AlbumData, PlaylistData } from "./types";

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
				navigate({
					to: "/station/$token",
					params: { token: playlist.id },
					search: { play: undefined },
				});
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

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 space-y-16">
			<PlaylistShelf
				playlists={playlists}
				isLoading={playlistsQuery.isLoading}
				onOpenPlaylist={handleOpenPlaylist}
				onSeeAll={() => navigate({ to: "/stations" })}
			/>

			{hotQuery.isLoading ? (
				<CollectionGridSkeleton title="Hot" />
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
				<CollectionGridSkeleton title="Discovery" />
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
				<CollectionGridSkeleton title="Collection" />
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
					<CollectionGridSkeleton title="Archive" />
				) : (
					<AlbumShelf
						title="Archive"
						albums={archiveAlbums}
						emptyMessage="Archive is empty."
					/>
				)
			) : null}
		</div>
	);
}
