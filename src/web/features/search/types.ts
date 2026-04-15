import type { AlbumPlacement } from "@/web/shared/lib/library-placement";

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
	readonly albumId: string;
	readonly placement: AlbumPlacement;
	readonly isHot: boolean;
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
