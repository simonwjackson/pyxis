// Canonical types for the source abstraction layer.
// All sources normalize their data to these types.

export type SourceType = "pandora" | "ytmusic" | "local" | "musicbrainz" | "discogs" | "deezer" | "bandcamp" | "soundcloud";

export type ReleaseType =
	| "album"
	| "ep"
	| "single"
	| "compilation"
	| "soundtrack"
	| "live"
	| "remix"
	| "other";

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
	readonly genres?: readonly string[];
	readonly releaseType?: ReleaseType;
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

export type AlbumCapability = {
	readonly getAlbumTracks: (
		albumId: string,
	) => Promise<{
		readonly album: CanonicalAlbum;
		readonly tracks: readonly CanonicalTrack[];
	}>;
};

export type Source = {
	readonly type: SourceType;
	readonly name: string;
} & Partial<
	SearchCapability &
		PlaylistCapability &
		StreamCapability &
		AlbumCapability
>;

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

export function hasAlbumCapability(
	source: Source,
): source is Source & AlbumCapability {
	return typeof source.getAlbumTracks === "function";
}

// --- Metadata source types (for enrichment-only sources) ---

export type NormalizedArtist = {
	readonly name: string;
	readonly sortName?: string;
	readonly ids: readonly SourceId[];
};

export type NormalizedRelease = {
	readonly fingerprint: string;
	readonly title: string;
	readonly artists: readonly NormalizedArtist[];
	readonly releaseType: ReleaseType;
	readonly year?: number;
	readonly ids: readonly SourceId[];
	readonly confidence: number;
	readonly genres: readonly string[];
	readonly artworkUrl?: string;
	readonly sourceScores?: Partial<Record<SourceType, number>>;
};

export type MetadataSearchQuery =
	| { readonly kind: "text"; readonly query: string }
	| { readonly kind: "structured"; readonly title: string; readonly artist: string };

export type MetadataSearchCapability = {
	readonly searchReleases: (
		query: MetadataSearchQuery,
		limit?: number,
	) => Promise<readonly NormalizedRelease[]>;
};

export type MetadataSource = {
	readonly type: SourceType;
	readonly name: string;
} & MetadataSearchCapability;

export function hasMetadataSearchCapability(
	source: Source | MetadataSource,
): source is MetadataSource {
	return "searchReleases" in source && typeof source.searchReleases === "function";
}
