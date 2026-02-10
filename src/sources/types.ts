/**
 * @module SourceTypes
 * Canonical types for the source abstraction layer.
 * All music sources (Pandora, YouTube Music, etc.) normalize their data to these types.
 */

/**
 * Identifier for a music source backend.
 * Used to route requests and identify where data originated.
 */
export type SourceType = "pandora" | "ytmusic" | "youtube" | "local" | "musicbrainz" | "discogs" | "deezer" | "bandcamp" | "soundcloud";

/**
 * Classification of a music release.
 * Used by metadata sources to categorize albums.
 */
export type ReleaseType =
	| "album"
	| "ep"
	| "single"
	| "compilation"
	| "soundtrack"
	| "live"
	| "remix"
	| "other";

/**
 * Unique identifier for an item within a specific source.
 * Combines source type with source-specific ID for disambiguation.
 */
export type SourceId = {
	readonly source: SourceType;
	readonly id: string;
};

/**
 * Normalized track representation across all sources.
 * All music sources convert their native track format to this type.
 */
export type CanonicalTrack = {
	/** Unique identifier (source-specific, may be track token or video ID) */
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	/** Duration in seconds */
	readonly duration?: number;
	/** Source identifier for routing stream requests */
	readonly sourceId: SourceId;
	/** URL to album/track artwork image */
	readonly artworkUrl?: string;
};

/**
 * Normalized album representation across all sources.
 * May have multiple sourceIds when aggregated from multiple metadata providers.
 */
export type CanonicalAlbum = {
	/** Primary identifier (from highest-priority source) */
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly tracks: readonly CanonicalTrack[];
	readonly artworkUrl?: string;
	/** All source references, sorted by quality priority (best first) */
	readonly sourceIds: readonly SourceId[];
	readonly genres?: readonly string[];
	readonly releaseType?: ReleaseType;
};

/**
 * Normalized playlist representation across all sources.
 * For Pandora, playlists are radio stations.
 */
export type CanonicalPlaylist = {
	/** Source-specific playlist identifier */
	readonly id: string;
	readonly name: string;
	readonly source: SourceType;
	/** Additional context (e.g., "Shuffle" for QuickMix, "Radio" for auto-generated) */
	readonly description?: string;
	readonly artworkUrl?: string;
};

// --- Capability interfaces ---
// Sources implement zero or more of these based on their features.

/**
 * Search results containing tracks and albums.
 */
export type SearchResult = {
	readonly tracks: readonly CanonicalTrack[];
	readonly albums: readonly CanonicalAlbum[];
};

/**
 * Capability for searching tracks and albums.
 */
export type SearchCapability = {
	readonly search: (query: string) => Promise<SearchResult>;
};

/**
 * Capability for listing and accessing playlists.
 * For Pandora, "playlists" are radio stations.
 */
export type PlaylistCapability = {
	readonly listPlaylists: () => Promise<readonly CanonicalPlaylist[]>;
	readonly getPlaylistTracks: (
		playlistId: string,
	) => Promise<readonly CanonicalTrack[]>;
};

/**
 * Capability for resolving stream URLs for playback.
 */
export type StreamCapability = {
	readonly getStreamUrl: (trackId: string) => Promise<string>;
};

/**
 * Capability for fetching album details and track listings.
 */
export type AlbumCapability = {
	readonly getAlbumTracks: (
		albumId: string,
	) => Promise<{
		readonly album: CanonicalAlbum;
		readonly tracks: readonly CanonicalTrack[];
	}>;
};

/**
 * Base source type with optional capabilities.
 * Check capabilities with type guards before calling methods.
 *
 * @example
 * ```ts
 * if (hasStreamCapability(source)) {
 *   const url = await source.getStreamUrl(trackId);
 * }
 * ```
 */
export type Source = {
	readonly type: SourceType;
	/** Human-readable source name for display */
	readonly name: string;
} & Partial<
	SearchCapability &
		PlaylistCapability &
		StreamCapability &
		AlbumCapability
>;

// --- Type guards for capability checking ---

/**
 * Type guard to check if a source supports search operations.
 * @param source - Source to check
 * @returns True if source implements SearchCapability
 */
export function hasSearchCapability(
	source: Source,
): source is Source & SearchCapability {
	return typeof source.search === "function";
}

/**
 * Type guard to check if a source supports playlist operations.
 * @param source - Source to check
 * @returns True if source implements PlaylistCapability
 */
export function hasPlaylistCapability(
	source: Source,
): source is Source & PlaylistCapability {
	return (
		typeof source.listPlaylists === "function" &&
		typeof source.getPlaylistTracks === "function"
	);
}

/**
 * Type guard to check if a source supports audio streaming.
 * @param source - Source to check
 * @returns True if source implements StreamCapability
 */
export function hasStreamCapability(
	source: Source,
): source is Source & StreamCapability {
	return typeof source.getStreamUrl === "function";
}

/**
 * Type guard to check if a source supports album operations.
 * @param source - Source to check
 * @returns True if source implements AlbumCapability
 */
export function hasAlbumCapability(
	source: Source,
): source is Source & AlbumCapability {
	return typeof source.getAlbumTracks === "function";
}

// --- Metadata source types (for enrichment-only sources like MusicBrainz, Discogs) ---

/**
 * Normalized artist information from metadata sources.
 */
export type NormalizedArtist = {
	readonly name: string;
	/** Name formatted for alphabetical sorting (e.g., "Beatles, The") */
	readonly sortName?: string;
	readonly ids: readonly SourceId[];
};

/**
 * Normalized release information from metadata sources.
 * Used for album matching and enrichment across multiple providers.
 */
export type NormalizedRelease = {
	/** Computed fingerprint for exact matching (artist::title::year) */
	readonly fingerprint: string;
	readonly title: string;
	readonly artists: readonly NormalizedArtist[];
	readonly releaseType: ReleaseType;
	readonly year?: number;
	/** All source references for this release */
	readonly ids: readonly SourceId[];
	/** Match confidence score (0-1) */
	readonly confidence: number;
	readonly genres: readonly string[];
	readonly artworkUrl?: string;
	/** Per-source relevance scores for ranking */
	readonly sourceScores?: Partial<Record<SourceType, number>>;
};

/**
 * Query format for metadata searches.
 * Structured queries are more precise but require title/artist separation.
 */
export type MetadataSearchQuery =
	| { readonly kind: "text"; readonly query: string }
	| { readonly kind: "structured"; readonly title: string; readonly artist: string };

/**
 * Capability for searching release metadata.
 * Used by enrichment-only sources (MusicBrainz, Discogs, Deezer).
 */
export type MetadataSearchCapability = {
	readonly searchReleases: (
		query: MetadataSearchQuery,
		limit?: number,
	) => Promise<readonly NormalizedRelease[]>;
};

/**
 * Metadata-only source type for album enrichment.
 * These sources cannot stream audio but provide metadata for matching.
 */
export type MetadataSource = {
	readonly type: SourceType;
	readonly name: string;
} & MetadataSearchCapability;

/**
 * Type guard to check if a source supports metadata searches.
 * @param source - Source to check
 * @returns True if source implements MetadataSearchCapability
 */
export function hasMetadataSearchCapability(
	source: Source | MetadataSource,
): source is MetadataSource {
	return "searchReleases" in source && typeof source.searchReleases === "function";
}

// --- Source priority for multi-source album selection ---

/**
 * Priority ranking for source selection when multiple sources have the same album.
 * Lower number = higher quality = preferred for playback.
 *
 * Used when sorting sourceIds in CanonicalAlbum to pick the best streaming source.
 * Metadata-only sources have priority 99 (never used for streaming).
 */
export const SOURCE_PRIORITY: Readonly<Record<SourceType, number>> = {
	ytmusic: 1,     // opus/m4a ~128-256 kbps variable
	youtube: 1,     // same quality tier as ytmusic (both use yt-dlp)
	soundcloud: 2,  // mp3/opus ~128-256 kbps progressive
	bandcamp: 3,    // mp3 128 kbps fixed
	pandora: 4,     // aac/mp3 64-192 kbps, radio-only (not album-capable)
	// Metadata-only sources (no streaming)
	deezer: 99,
	discogs: 99,
	musicbrainz: 99,
	local: 99,
};
