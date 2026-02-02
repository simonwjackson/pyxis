import type {
	Source,
	SourceType,
	CanonicalPlaylist,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
	MetadataSource,
	MetadataSearchQuery,
	NormalizedRelease,
} from "./types.js";
import {
	hasPlaylistCapability,
	hasStreamCapability,
	hasSearchCapability,
	hasAlbumCapability,
	hasMetadataSearchCapability,
	SOURCE_PRIORITY,
} from "./types.js";
import { createMatcher } from "./matcher.js";
import type { Logger } from "../logger.js";

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
	// Sort sourceIds by quality priority (lower number = higher quality = first)
	const sortedIds = [...nr.ids].sort((a, b) => {
		const pa = SOURCE_PRIORITY[a.source] ?? 99;
		const pb = SOURCE_PRIORITY[b.source] ?? 99;
		return pa - pb;
	});

	return {
		id: sortedIds[0]?.id ?? "",
		title: nr.title,
		artist: nr.artists[0]?.name ?? "Unknown",
		...(nr.year != null ? { year: nr.year } : {}),
		tracks: [],
		...(nr.artworkUrl != null ? { artworkUrl: nr.artworkUrl } : {}),
		sourceIds: sortedIds,
		genres: nr.genres,
		releaseType: nr.releaseType,
	};
}

export function createSourceManager(
	sources: readonly Source[],
	metadataSources: readonly MetadataSource[] = [],
	logger?: Logger,
): SourceManager {
	const log = logger?.child({ component: "search" });
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
			const primaryStart = Date.now();

			// 1. Search primary sources first
			const searchableSources = sources.filter(hasSearchCapability);
			const metadataSearchable = metadataSources.filter(hasMetadataSearchCapability);

			const primaryResults = await Promise.allSettled(
				searchableSources.map((source) => source.search(query)),
			);

			const primaryMs = Date.now() - primaryStart;

			// 2. Collect tracks and albums from primary sources
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
				log?.info(
					{
						query,
						primary: {
							sources: searchableSources.map((s) => s.type),
							albums: primaryAlbums.length,
							tracks: allTracks.length,
							ms: primaryMs,
						},
					},
					"search complete (no metadata sources)",
				);
				return { tracks: allTracks, albums: primaryAlbums };
			}

			// 4. Build targeted per-album queries from primary results
			const seen = new Set<string>();
			const albumQueries: MetadataSearchQuery[] = [];
			const MAX_ALBUM_LOOKUPS = 8;
			for (const album of primaryAlbums) {
				const key = `${album.title.toLowerCase()}::${album.artist.toLowerCase()}`;
				if (!seen.has(key) && albumQueries.length < MAX_ALBUM_LOOKUPS) {
					seen.add(key);
					albumQueries.push({ kind: "structured" as const, title: album.title, artist: album.artist });
				}
			}

			// 5. Run targeted metadata lookups (1 result per query is enough for enrichment)
			const metadataStart = Date.now();
			const metadataResults = await Promise.allSettled(
				metadataSearchable.flatMap((source) =>
					albumQueries.map((q) => source.searchReleases(q, 1)),
				),
			);
			const metadataMs = Date.now() - metadataStart;

			// 6. Log metadata source failures as warnings
			for (let i = 0; i < metadataResults.length; i++) {
				const result = metadataResults[i];
				if (result?.status === "rejected") {
					const sourceIdx = Math.floor(i / albumQueries.length);
					const source = metadataSearchable[sourceIdx];
					log?.warn(
						{ source: source?.type, err: String(result.reason) },
						"metadata source failed (non-blocking)",
					);
				}
			}

			// 7. Normalize primary albums to NormalizedRelease
			const normalizedPrimary = primaryAlbums.map(canonicalToNormalized);

			// 8. Collect metadata-only results
			const metadataAlbums: NormalizedRelease[] = [];
			for (const result of metadataResults) {
				if (result.status === "fulfilled") {
					metadataAlbums.push(...result.value);
				}
			}

			// 9. Feed everything through matcher (primary first so they're the "existing" entries)
			const matcher = createMatcher({ similarityThreshold: 0.85 });
			for (const album of normalizedPrimary) {
				matcher.addOrMerge(album);
			}
			for (const album of metadataAlbums) {
				matcher.addOrMerge(album);
			}

			const stats = matcher.getStats();

			// 10. Convert back to CanonicalAlbum
			const mergedAlbums = matcher
				.getAll()
				.map(normalizedToCanonicalAlbum);

			const totalMs = Date.now() - primaryStart;

			log?.info(
				{
					query,
					primary: {
						sources: searchableSources.map((s) => s.type),
						albums: primaryAlbums.length,
						tracks: allTracks.length,
						ms: primaryMs,
					},
					metadata: {
						sources: metadataSearchable.map((s) => s.type),
						albums: metadataAlbums.length,
						queries: albumQueries.length,
						ms: metadataMs,
					},
					matcher: {
						total: stats.total,
						exact: stats.exactMatches,
						fuzzy: stats.fuzzyMatches,
						new: stats.newEntries,
					},
				},
				"search complete",
			);

			return { tracks: allTracks, albums: mergedAlbums };
		},
	};
}
