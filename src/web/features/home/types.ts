import type { AlbumPlacement } from "@app/shared/lib/library-placement";

export type PlaylistData = {
  readonly id: string;
  readonly name: string;
  readonly artworkUrl?: string | null;
};

export type AlbumData = {
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
