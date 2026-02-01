import type {
	Source,
	SourceType,
	CanonicalPlaylist,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
} from "./types.js";
import {
	hasPlaylistCapability,
	hasStreamCapability,
	hasSearchCapability,
	hasAlbumCapability,
} from "./types.js";

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

export function createSourceManager(
	sources: readonly Source[],
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
			const results = await Promise.allSettled(
				sources
					.filter(hasSearchCapability)
					.map((source) => source.search(query)),
			);
			const allTracks: CanonicalTrack[] = [];
			const allAlbums: SearchResult["albums"][number][] = [];
			for (const result of results) {
				if (result.status === "fulfilled") {
					allTracks.push(...result.value.tracks);
					allAlbums.push(...result.value.albums);
				}
			}
			return { tracks: allTracks, albums: allAlbums };
		},
	};
}
