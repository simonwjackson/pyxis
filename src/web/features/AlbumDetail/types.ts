import type { AlbumPlacement } from "@app/shared/lib/libraryPlacement";

export type AlbumDetailPageProps = {
  readonly albumId: string;
  readonly autoPlay?: boolean;
  readonly startIndex?: number;
  readonly shuffle?: boolean;
};

export type AlbumDetailAlbum = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly year?: number | null;
  readonly artworkUrl?: string | null;
};

export type AlbumDetailTrack = {
  readonly id: string;
  readonly trackIndex: number;
  readonly title: string;
  readonly duration?: number | null;
};

export type AlbumDetailContentProps = {
  readonly album: AlbumDetailAlbum;
  readonly tracks: readonly AlbumDetailTrack[];
  readonly currentTrackId?: string | undefined;
  readonly currentPlacement?: AlbumPlacement | undefined;
  readonly isHot: boolean;
  readonly canManagePlacement: boolean;
  readonly canEditMetadata: boolean;
  readonly isSavingAlbum: boolean;
  readonly isSettingPlacement: boolean;
  readonly onBack: () => void;
  readonly onPlay: () => void;
  readonly onPlayTrack: (index: number) => void;
  readonly onSaveAlbum?: (() => void) | undefined;
  readonly onSetPlacement?: ((placement: AlbumPlacement) => void) | undefined;
  readonly onUpdateAlbum?:
    | ((patch: { readonly title?: string; readonly artist?: string }) => void)
    | undefined;
  readonly onUpdateTrack?:
    | ((trackId: string, title: string) => void)
    | undefined;
};
