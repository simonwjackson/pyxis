import type { AlbumPlacement } from "@app/shared/lib/libraryPlacement";

export type SearchArtist = {
  readonly musicToken: string;
  readonly artistName: string;
};

export type SearchSong = {
  readonly musicToken: string;
  readonly songName: string;
  readonly artistName: string;
};

export type SearchGenreStation = {
  readonly musicToken: string;
  readonly stationName: string;
};

export type SearchTrack = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  readonly artworkUrl?: string | null;
  readonly capabilities: { readonly radio: boolean };
};

export type SearchAlbumState = {
  readonly _tag: "InLibrary";
  readonly albumId: string;
  readonly placement: AlbumPlacement;
  readonly isHot: boolean;
};

export const SearchAlbumState = {
  placement: (state: SearchAlbumState): AlbumPlacement => state.placement,
  isHot: (state: SearchAlbumState): boolean => state.isHot,
  canAdd: (state: SearchAlbumState | undefined): boolean =>
    state === undefined || state.placement === "dismissed",
  actionLabel: (state: SearchAlbumState | undefined): string =>
    state?.placement === "dismissed"
      ? "Re-add to Discovery"
      : "Add to Discovery",
};

export type SearchAlbum = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly year?: number | null;
  readonly artworkUrl?: string | null;
  readonly sourceIds: readonly string[];
  readonly genres?: readonly string[];
  readonly releaseType?: string;
  readonly state?: SearchAlbumState;
};
