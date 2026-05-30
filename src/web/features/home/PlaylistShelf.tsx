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
  if (state._tag !== "Ready") return <PlaylistShelfPending state={state} />;
  return (
    <PlaylistShelfReadyState
      state={state}
      onOpenPlaylist={onOpenPlaylist}
      onSeeAll={onSeeAll}
    />
  );
}

function PlaylistShelfPending({
  state,
}: {
  readonly state: Exclude<HomeShelfState<PlaylistData>, { _tag: "Ready" }>;
}) {
  const View =
    state._tag === "Loading" ? PlaylistShelfLoading : PlaylistShelfLoadError;
  return <View />;
}

function PlaylistShelfReadyState({
  state,
  onOpenPlaylist,
  onSeeAll,
}: {
  readonly state: Extract<HomeShelfState<PlaylistData>, { _tag: "Ready" }>;
  readonly onOpenPlaylist: (playlist: PlaylistData) => void;
  readonly onSeeAll: () => void;
}) {
  if (state.items.length === 0) return <PlaylistShelfEmpty />;
  return (
    <PlaylistShelfReady
      playlists={state.items}
      onOpenPlaylist={onOpenPlaylist}
      onSeeAll={onSeeAll}
    />
  );
}

function PlaylistShelfLoading() {
  return <CollectionGridSkeleton title="my playlists" />;
}

function PlaylistShelfLoadError() {
  return (
    <CollectionGridEmpty
      title="my playlists"
      message="Unable to load playlists right now."
    />
  );
}

function PlaylistShelfEmpty() {
  return (
    <CollectionGridEmpty
      title="my playlists"
      message="No playlists found. Create a station to get started."
    />
  );
}

function PlaylistShelfReady({
  playlists,
  onOpenPlaylist,
  onSeeAll,
}: {
  readonly playlists: readonly PlaylistData[];
  readonly onOpenPlaylist: (playlist: PlaylistData) => void;
  readonly onSeeAll: () => void;
}) {
  const renderPlaylistItem = useCallback(
    (playlist: PlaylistData) => (
      <PlaylistCard
        playlist={playlist}
        onPlay={() => onOpenPlaylist(playlist)}
      />
    ),
    [onOpenPlaylist],
  );

  return (
    <CollectionGridRoot
      title="my playlists"
      items={playlists}
      keyOf={(playlist) => playlist.id}
      renderItem={renderPlaylistItem}
      filterFn={filterPlaylist}
      sortOptions={PLAYLIST_SORT_OPTIONS}
      defaultSort="shuffle"
      paramPrefix="pl"
      headerActions={<PlaylistShelfSeeAllAction onSeeAll={onSeeAll} />}
    />
  );
}

function PlaylistShelfSeeAllAction({
  onSeeAll,
}: {
  readonly onSeeAll: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSeeAll}
      className="zune-label text-pyxis-dim hover:text-pyxis-text transition-colors"
    >
      see all
    </button>
  );
}
