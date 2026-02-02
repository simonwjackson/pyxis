import type {
	Source,
	SourceType,
	CanonicalPlaylist,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
	MetadataSource,
	NormalizedRelease,
} from "./types.js";
import {
	hasPlaylistCapability,
	hasStreamCapability,
	hasSearchCapability,
	hasAlbumCapability,
	hasMetadataSearchCapability,
} from "./types.js";
import { createMatcher } from "./matcher.js";

export type SourceManager = {
	readonly getSource: (type: SourceType) => Source | undefined;
	readonly getAllSources: () => readonly Source[];
	readonly listAllPlaylists: () => Promise<readonly CanonicalPlaylist[]>;
	readonly getPlaylistTracks: (
		source: SourceType,
		playlistId: string,
	) => Promise<readonly CanonicalTrack[]>;
	readonly getStreamUrl: (
		source: SourceType,
		trackId: string,
	) => Promise<string>;
	readonly searchAll: (query: string) => Promise<SearchResult>;
	readonly getAlbumTracks: (
		source: SourceType,
		albumId: string,
	) => Promise<{
		readonly album: CanonicalAlbum;
		readonly tracks: readonly CanonicalTrack[];
	}>;
};

// --- Conversion helpers ---

function canonicalToNormalized(album: CanonicalAlbum): NormalizedRelease {
	return {
		fingerprint: "",
		title: album.title,
		artists: [
			{
				name: album.artist,
				ids: album.sourceIds,
			},
		],
		releaseType: album.releaseType ?? "album",
		...(album.year != null ? { year: album.year } : {}),
		ids: album.sourceIds,
		confidence: 1,
		genres: album.genres ?? [],
		...(album.artworkUrl != null ? { artworkUrl: album.artworkUrl } : {}),
	};
}

function normalizedToCanonicalAlbum(nr: NormalizedRelease): CanonicalAlbum {
	return {
		id: nr.ids[0]?.id ?? "",
		title: nr.title,
		artist: nr.artists[0]?.name ?? "Unknown",
		...(nr.year != null ? { year: nr.year } : {}),
		tracks: [],
		...(nr.artworkUrl != null ? { artworkUrl: nr.artworkUrl } : {}),
		sourceIds: nr.ids,
		genres: nr.genres,
		releaseType: nr.releaseType,
	};
}

export function createSourceManager(
	sources: readonly Source[],
	metadataSources: readonly MetadataSource[] = [],
): SourceManager {
	const sourceMap = new Map<SourceType, Source>();
	for (const source of sources) {
		sourceMap.set(source.type, source);
	}

	return {
		getSource(type) {
			return sourceMap.get(type);
		},

		getAllSources() {
			return sources;
		},

		async listAllPlaylists() {
			const results: CanonicalPlaylist[] = [];
			for (const source of sources) {
				if (hasPlaylistCapability(source)) {
					const playlists = await source.listPlaylists();
					results.push(...playlists);
				}
			}
			return results;
		},

		async getPlaylistTracks(sourceType, playlistId) {
			const source = sourceMap.get(sourceType);
			if (!source || !hasPlaylistCapability(source)) {
				throw new Error(
					`Source "${sourceType}" does not support playlists`,
				);
			}
			return source.getPlaylistTracks(playlistId);
		},

		async getStreamUrl(sourceType, trackId) {
			const source = sourceMap.get(sourceType);
			if (!source || !hasStreamCapability(source)) {
				throw new Error(
					`Source "${sourceType}" does not support streaming`,
				);
			}
			return source.getStreamUrl(trackId);
		},

		async getAlbumTracks(sourceType, albumId) {
			const source = sourceMap.get(sourceType);
			if (!source || !hasAlbumCapability(source)) {
				throw new Error(
					`Source "${sourceType}" does not support album tracks`,
				);
			}
			return source.getAlbumTracks(albumId);
		},

		async searchAll(query: string): Promise<SearchResult> {
			// 1. Run ALL sources in parallel
			const [primaryResults, metadataResults] = await Promise.all([
				// Existing sources (Pandora, YTMusic) — return SearchResult
				Promise.allSettled(
					sources
						.filter(hasSearchCapability)
						.map((source) => source.search(query)),
				),
				// Metadata sources (MusicBrainz, Discogs) — return NormalizedRelease[]
				Promise.allSettled(
					metadataSources
						.filter(hasMetadataSearchCapability)
						.map((source) => source.searchReleases(query, 10)),
				),
			]);

			// 2. Collect tracks from primary sources (unchanged)
			const allTracks: CanonicalTrack[] = [];
			const primaryAlbums: CanonicalAlbum[] = [];
			for (const result of primaryResults) {
				if (result.status === "fulfilled") {
					allTracks.push(...result.value.tracks);
					primaryAlbums.push(...result.value.albums);
				}
			}

			// 3. If no metadata sources, return as before (fast path)
			if (metadataSources.length === 0) {
				return { tracks: allTracks, albums: primaryAlbums };
			}

			// 4. Normalize primary albums to NormalizedRelease
			const normalizedPrimary = primaryAlbums.map(canonicalToNormalized);

			// 5. Collect metadata-only results
			const metadataAlbums: NormalizedRelease[] = [];
			for (const result of metadataResults) {
				if (result.status === "fulfilled") {
					metadataAlbums.push(...result.value);
				}
			}

			// 6. Feed everything through matcher (primary first so they're the "existing" entries)
			const matcher = createMatcher({ similarityThreshold: 0.85 });
			for (const album of normalizedPrimary) {
				matcher.addOrMerge(album);
			}
			for (const album of metadataAlbums) {
				matcher.addOrMerge(album);
			}

			// 7. Convert back to CanonicalAlbum
			const mergedAlbums = matcher
				.getAll()
				.map(normalizedToCanonicalAlbum);

			return { tracks: allTracks, albums: mergedAlbums };
		},
	};
}
