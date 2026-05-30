import { CollectionGridEmpty } from "@app/shared/ui/collection-grid/CollectionGridEmpty";
import { CollectionGridRoot } from "@app/shared/ui/collection-grid/CollectionGridRoot";
import { CollectionGridSkeleton } from "@app/shared/ui/collection-grid/CollectionGridSkeleton";
import type { SortOption } from "@app/shared/ui/collection-grid/types";
import { ArrowDownAZ, Clock, Shuffle } from "lucide-react";
import { useCallback } from "react";
import type { HomeShelfState } from "./HomeState";
import { PlaylistCard } from "./PlaylistCard";
import type { PlaylistData } from "./types";

const PLAYLIST_SORT_OPTIONS: readonly SortOption<PlaylistData>[] = [
  { key: "shuffle", label: "Shuffle", icon: Shuffle, comparator: "shuffle" },
  {
    key: "az",
    label: "A → Z",
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

const filterPlaylist = (playlist: PlaylistData, query: string) =>
  playlist.name.toLowerCase().includes(query);

type PlaylistShelfProps = {
  readonly state: HomeShelfState<PlaylistData>;
  readonly onOpenPlaylist: (playlist: PlaylistData) => void;
  readonly onSeeAll: () => void;
};

export function PlaylistShelf({
  state,
  onOpenPlaylist,
  onSeeAll,
}: PlaylistShelfProps) {
  const renderPlaylistItem = useCallback(
    (playlist: PlaylistData) => (
      <PlaylistCard
        playlist={playlist}
        onPlay={() => onOpenPlaylist(playlist)}
      />
    ),
    [onOpenPlaylist],
  );

  switch (state._tag) {
    case "Loading":
      return <CollectionGridSkeleton title="my playlists" />;
    case "LoadError":
    case "Defect":
      return (
        <CollectionGridEmpty
          title="my playlists"
          message="Unable to load playlists right now."
        />
      );
    case "Ready":
      if (state.items.length === 0) {
        return (
          <CollectionGridEmpty
            title="my playlists"
            message="No playlists found. Create a station to get started."
          />
        );
      }
      return (
        <CollectionGridRoot
          title="my playlists"
          items={state.items}
          keyOf={(playlist) => playlist.id}
          renderItem={renderPlaylistItem}
          filterFn={filterPlaylist}
          sortOptions={PLAYLIST_SORT_OPTIONS}
          defaultSort="shuffle"
          paramPrefix="pl"
          headerActions={
            <button
              type="button"
              onClick={onSeeAll}
              className="zune-label text-pyxis-dim hover:text-pyxis-text transition-colors"
            >
              see all
            </button>
          }
        />
      );
  }
}
