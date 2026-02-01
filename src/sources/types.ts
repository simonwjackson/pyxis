// Canonical types for the source abstraction layer.
// All sources normalize their data to these types.

export type SourceType = "pandora" | "ytmusic" | "local";

export type SourceId = {
	readonly source: SourceType;
	readonly id: string;
};

export type CanonicalTrack = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly duration?: number;
	readonly sourceId: SourceId;
	readonly artworkUrl?: string;
};

export type CanonicalAlbum = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly tracks: readonly CanonicalTrack[];
	readonly artworkUrl?: string;
	readonly sourceIds: readonly SourceId[];
};

export type CanonicalPlaylist = {
	readonly id: string;
	readonly name: string;
	readonly source: SourceType;
	readonly description?: string;
	readonly artworkUrl?: string;
};

// Capabilities that sources can implement

export type SearchResult = {
	readonly tracks: readonly CanonicalTrack[];
	readonly albums: readonly CanonicalAlbum[];
};

export type SearchCapability = {
	readonly search: (query: string) => Promise<SearchResult>;
};

export type PlaylistCapability = {
	readonly listPlaylists: () => Promise<readonly CanonicalPlaylist[]>;
	readonly getPlaylistTracks: (
		playlistId: string,
	) => Promise<readonly CanonicalTrack[]>;
};

export type StreamCapability = {
	readonly getStreamUrl: (trackId: string) => Promise<string>;
};

export type Source = {
	readonly type: SourceType;
	readonly name: string;
} & Partial<SearchCapability & PlaylistCapability & StreamCapability>;

// Type guards for capability checking

export function hasSearchCapability(
	source: Source,
): source is Source & SearchCapability {
	return typeof source.search === "function";
}

export function hasPlaylistCapability(
	source: Source,
): source is Source & PlaylistCapability {
	return (
		typeof source.listPlaylists === "function" &&
		typeof source.getPlaylistTracks === "function"
	);
}

export function hasStreamCapability(
	source: Source,
): source is Source & StreamCapability {
	return typeof source.getStreamUrl === "function";
}
