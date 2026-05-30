/**
 * @module HomePage
 * Placement-aware home page with Hot, Discovery, and Collection shelves.
 *
 * Reads playlists and library album shelves through the Effect RPC client.
 * Each shelf is its own internal sub-component so the archive shelf only
 * subscribes (and only fetches) when the user expands it — preserving the
 * legacy `enabled: showArchive` behavior — and so each shelf renders its
 * own loading/ready state without interleaving raw `AsyncResult` checks
 * in the page JSX. Shelves subscribe to {@link LIBRARY_ALBUMS_TAG},
 * {@link LIBRARY_HOT_ALBUMS_TAG}, and {@link PLAYLIST_LIST_TAG} so library
 * mutations on other surfaces refresh the page in step with the legacy
 * `utils.library.albums.invalidate()`, `utils.library.hotAlbums.invalidate()`,
 * and `utils.playlist.list.invalidate()` fan-outs.
 */

import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { CollectionGridSkeleton } from "@app/shared/ui/collection-grid/CollectionGridSkeleton";
import { AlbumShelf, HOT_SORT_OPTIONS } from "./AlbumShelf";
import { HomeState } from "./HomeState";
import {
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  PLAYLIST_LIST_TAG,
} from "./libraryReactivityTags";
import { PlaylistShelf } from "./PlaylistShelf";
import type { PlaylistData } from "./types";

const playlistsQueryAtom = PyxisRpcClient.query("library.playlists.list", undefined, {
  reactivityKeys: [PLAYLIST_LIST_TAG] as const,
});

const hotAlbumsQueryAtom = PyxisRpcClient.query(
  "library.hotAlbums.list",
  { includeDismissed: true, limit: 10 },
  { reactivityKeys: [LIBRARY_HOT_ALBUMS_TAG, LIBRARY_ALBUMS_TAG] as const },
);

const discoveryAlbumsQueryAtom = PyxisRpcClient.query(
  "library.albums.list",
  { placements: ["discovery"] as const },
  { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
);

const collectionAlbumsQueryAtom = PyxisRpcClient.query(
  "library.albums.list",
  { placements: ["collection"] as const },
  { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
);

const archiveAlbumsQueryAtom = PyxisRpcClient.query(
  "library.albums.list",
  { placements: ["archive"] as const },
  { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
);

export function HomePage() {
  const navigate = useNavigate();
  const [showArchive, setShowArchive] = useState(false);

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
          search: {
            play: undefined,
            startIndex: undefined,
            shuffle: undefined,
          },
        });
      }
    },
    [navigate],
  );

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-16">
      <HomePlaylistShelfSection
        onOpenPlaylist={handleOpenPlaylist}
        onSeeAll={() => navigate({ to: "/stations" })}
      />

      <HomeHotShelfSection />

      <HomeDiscoveryShelfSection
        onAddAlbum={() => navigate({ to: "/search" })}
      />

      <HomeCollectionShelfSection
        showArchive={showArchive}
        onToggleArchive={() => setShowArchive((value) => !value)}
      />

      {showArchive ? <HomeArchiveShelfSection /> : null}
    </div>
  );
}

function HomePlaylistShelfSection({
  onOpenPlaylist,
  onSeeAll,
}: {
  readonly onOpenPlaylist: (playlist: PlaylistData) => void;
  readonly onSeeAll: () => void;
}) {
  const result = projectQueryResult(useAtomValue(playlistsQueryAtom));
  const state = HomeState.playlistShelfFromResult(result);
  const playlists = state._tag === "Ready" ? state.items : [];

  return (
    <PlaylistShelf
      playlists={playlists}
      isLoading={state._tag === "Loading"}
      onOpenPlaylist={onOpenPlaylist}
      onSeeAll={onSeeAll}
    />
  );
}

function HomeHotShelfSection() {
  const result = projectQueryResult(useAtomValue(hotAlbumsQueryAtom));
  const state = HomeState.albumShelfFromResult(result);

  if (state._tag === "Loading") {
    return <CollectionGridSkeleton title="Hot" />;
  }

  const albums = state._tag === "Ready" ? state.items : [];

  return (
    <AlbumShelf
      title="Hot"
      albums={albums}
      emptyMessage="Nothing hot yet. Listen to an album a few times and it will surface here."
      sortOptions={HOT_SORT_OPTIONS}
      defaultSort="hot"
    />
  );
}

function HomeDiscoveryShelfSection({
  onAddAlbum,
}: {
  readonly onAddAlbum: () => void;
}) {
  const result = projectQueryResult(useAtomValue(discoveryAlbumsQueryAtom));
  const state = HomeState.albumShelfFromResult(result);

  if (state._tag === "Loading") {
    return <CollectionGridSkeleton title="Discovery" />;
  }

  const albums = state._tag === "Ready" ? state.items : [];

  return (
    <AlbumShelf
      title="Discovery"
      albums={albums}
      emptyMessage="Nothing in discovery yet. Add an album to get started."
      trailing={
        <button
          type="button"
          className="aspect-square border border-dashed border-[var(--color-border)] flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-text-dim)] transition-colors"
          onClick={onAddAlbum}
          aria-label="Add album"
        >
          <Plus
            className="w-8 h-8 text-[var(--color-text-dim)] mb-1"
            aria-hidden="true"
          />
          <span className="zune-meta text-[var(--color-text-dim)]">
            add album
          </span>
        </button>
      }
    />
  );
}

function HomeCollectionShelfSection({
  showArchive,
  onToggleArchive,
}: {
  readonly showArchive: boolean;
  readonly onToggleArchive: () => void;
}) {
  const result = projectQueryResult(useAtomValue(collectionAlbumsQueryAtom));
  const state = HomeState.albumShelfFromResult(result);

  if (state._tag === "Loading") {
    return <CollectionGridSkeleton title="Collection" />;
  }

  const albums = state._tag === "Ready" ? state.items : [];

  return (
    <AlbumShelf
      title="Collection"
      albums={albums}
      emptyMessage="Nothing in collection yet. Move albums here when they become keepers."
      headerAction={
        <button
          type="button"
          onClick={onToggleArchive}
          className="zune-label text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
        >
          {showArchive ? "hide archive" : "show archive"}
        </button>
      }
    />
  );
}

function HomeArchiveShelfSection() {
  const result = projectQueryResult(useAtomValue(archiveAlbumsQueryAtom));
  const state = HomeState.albumShelfFromResult(result);

  if (state._tag === "Loading") {
    return <CollectionGridSkeleton title="Archive" />;
  }

  const albums = state._tag === "Ready" ? state.items : [];

  return (
    <AlbumShelf
      title="Archive"
      albums={albums}
      emptyMessage="Archive is empty."
    />
  );
}
