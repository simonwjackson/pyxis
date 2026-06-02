import { CollectionGridEmpty } from "@app/shared/ui/collection-grid/CollectionGridEmpty";
import { CollectionGridSkeleton } from "@app/shared/ui/collection-grid/CollectionGridSkeleton";
import type { ComponentProps } from "react";
import { AlbumShelf } from "./AlbumShelf";
import type { HomeShelfState } from "./HomeState";
import type { AlbumData } from "./types";

type AlbumShelfBaseProps = Omit<ComponentProps<typeof AlbumShelf>, "albums">;

type HomeAlbumShelfStateProps = AlbumShelfBaseProps & {
  readonly state: HomeShelfState<AlbumData>;
};

export function HomeAlbumShelfState(props: HomeAlbumShelfStateProps) {
  return (
    <>
      <HomeAlbumShelfLoadingState state={props.state} title={props.title} />
      <HomeAlbumShelfFailureState
        state={props.state}
        title={props.title}
        message={props.emptyMessage}
      />
      <HomeAlbumShelfReadyState {...props} />
    </>
  );
}

function HomeAlbumShelfLoadingState({
  state,
  title,
}: {
  readonly state: HomeShelfState<AlbumData>;
  readonly title: string;
}) {
  if (state._tag !== "Loading") return null;
  return <CollectionGridSkeleton title={title} />;
}

function HomeAlbumShelfFailureState({
  state,
  title,
  message,
}: {
  readonly state: HomeShelfState<AlbumData>;
  readonly title: string;
  readonly message: string;
}) {
  if (state._tag !== "LoadError" && state._tag !== "Defect") return null;
  return <CollectionGridEmpty title={title} message={message} />;
}

function HomeAlbumShelfReadyState({
  state,
  ...shelfProps
}: HomeAlbumShelfStateProps) {
  if (state._tag !== "Ready") return null;
  return <AlbumShelf {...shelfProps} albums={state.items} />;
}
