/**
 * @module ytmusic
 * YouTube Music source implementation for the Pyxis music player.
 * Provides search, playlist, album, and streaming capabilities via yt-dlp and internal API client.
 */

import type {
	Source,
	CanonicalTrack,
	CanonicalPlaylist,
	SearchResult,
	CanonicalAlbum,
} from "../types.js";
import * as ytdlp from "./yt-dlp.js";
import {
	createYTMusicApiClient,
	type YTMusicApiClient,
} from "./api-client.js";

/**
 * Configuration entry for a YouTube Music playlist.
 * Used to define playlists that the source should expose.
 */
export type YtMusicPlaylistEntry = {
	/** Unique identifier for the playlist within the application */
	readonly id: string;
	/** Full YouTube Music URL to the playlist */
	readonly url: string;
	/** Display name for the playlist */
	readonly name: string;
	/** Whether this playlist represents a radio/mix station */
	readonly isRadio?: boolean;
};

/**
 * Configuration options for the YouTube Music source.
 * Defines which playlists are available through the source.
 */
export type YtMusicConfig = {
	/** List of playlist entries to expose through the source */
	readonly playlists: readonly YtMusicPlaylistEntry[];
};

function entryToCanonical(entry: {
	readonly id: string;
	readonly title: string;
	readonly uploader?: string;
	readonly album?: string;
	readonly duration?: number;
	readonly thumbnail?: string;
}): CanonicalTrack {
	return {
		id: entry.id,
		title: entry.title || "Unknown Title",
		artist: entry.uploader ?? "Unknown",
		album: entry.album ?? "",
		sourceId: { source: "ytmusic", id: entry.id },
		...(entry.duration != null ? { duration: entry.duration } : {}),
		...(entry.thumbnail != null ? { artworkUrl: entry.thumbnail } : {}),
	};
}

/**
 * Generates a YouTube Music radio URL for a given video.
 * Radio URLs start playback of the specified video followed by similar tracks.
 *
 * @param videoId - YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns Full YouTube Music watch URL with radio playlist parameter
 */
export function generateRadioUrl(videoId: string): string {
	return `https://music.youtube.com/watch?v=${videoId}&list=RDAMVM${videoId}`;
}

/**
 * Creates a YouTube Music source instance that implements the Source interface.
 * The source provides search, playlist, album, and streaming capabilities.
 * Uses yt-dlp for track searches and streaming, and internal API client for album operations.
 *
 * @param config - Configuration specifying playlists and other source options
 * @returns A Source implementation for YouTube Music with search, playlist, album, and streaming methods
 */
export function createYtMusicSource(config: YtMusicConfig): Source {
	// Cache resolved playlist data
	const playlistCache = new Map<
		string,
		{
			readonly title: string;
			readonly entries: readonly CanonicalTrack[];
		}
	>();

	// Internal API client for album search (no yt-dlp subprocess needed)
	const apiClient: YTMusicApiClient = createYTMusicApiClient({
		appName: "Pyxis",
		version: "0.1.0",
		contact: "https://github.com/simonwjackson/pyxis",
	});

	return {
		type: "ytmusic",
		name: "YouTube Music",

		async search(query: string): Promise<SearchResult> {
			// Track search via yt-dlp (individual videos)
			const [entries, albumResults] = await Promise.allSettled([
				ytdlp.searchYtMusic(query, 10),
				apiClient.searchAlbums(query),
			]);

			const tracks =
				entries.status === "fulfilled"
					? entries.value.map(entryToCanonical)
					: [];

			const albums: readonly CanonicalAlbum[] =
				albumResults.status === "fulfilled"
					? albumResults.value.map((album) => ({
							id: album.id,
							title: album.name,
							artist: album.artists?.[0]?.name ?? "Unknown",
							...(album.year != null ? { year: album.year } : {}),
							tracks: [],
							sourceIds: [
								{ source: "ytmusic" as const, id: album.id },
							],
							...(album.thumbnailUrl != null
								? { artworkUrl: album.thumbnailUrl }
								: {}),
						}))
					: [];

			return { tracks, albums };
		},

		async listPlaylists(): Promise<readonly CanonicalPlaylist[]> {
			const results: CanonicalPlaylist[] = [];
			for (const playlist of config.playlists) {
				try {
					const info = await ytdlp.getPlaylistEntries(playlist.url);
					playlistCache.set(playlist.id, {
						title: playlist.name,
						entries: info.entries.map(entryToCanonical),
					});
					results.push({
						id: playlist.id,
						name: playlist.name,
						source: "ytmusic",
						...(playlist.isRadio
							? { description: "Radio" }
							: {}),
					});
				} catch {
					// Skip playlists that fail to load — still show them
					results.push({
						id: playlist.id,
						name: playlist.name,
						source: "ytmusic",
						...(playlist.isRadio
							? { description: "Radio" }
							: {}),
					});
				}
			}
			return results;
		},

		async getPlaylistTracks(
			playlistId: string,
		): Promise<readonly CanonicalTrack[]> {
			const cached = playlistCache.get(playlistId);
			if (cached) return cached.entries;

			// Try to find matching config entry and re-fetch
			const configEntry = config.playlists.find(
				(p) => p.id === playlistId || p.url.includes(playlistId),
			);
			if (configEntry) {
				const info = await ytdlp.getPlaylistEntries(configEntry.url);
				const entries = info.entries.map(entryToCanonical);
				playlistCache.set(playlistId, {
					title: configEntry.name,
					entries,
				});
				return entries;
			}

			// Fallback: try treating playlistId as a direct URL segment
			const url = playlistId.startsWith("http")
				? playlistId
				: `https://music.youtube.com/playlist?list=${playlistId}`;
			const info = await ytdlp.getPlaylistEntries(url);
			const entries = info.entries.map(entryToCanonical);
			playlistCache.set(playlistId, {
				title: info.title,
				entries,
			});
			return entries;
		},

		async getAlbumTracks(albumId: string) {
			// Use internal API client for album details (faster, no subprocess)
			const albumDetails = await apiClient.getAlbum(albumId);
			const tracks: readonly CanonicalTrack[] = albumDetails.tracks.map(
				(track, index) => ({
					id: track.videoId,
					title: track.name,
					artist:
						track.artists?.[0]?.name ??
						albumDetails.artists?.[0]?.name ??
						"Unknown",
					album: albumDetails.name,
					sourceId: {
						source: "ytmusic" as const,
						id: track.videoId,
					},
					...(track.duration != null
						? { duration: track.duration }
						: {}),
					trackIndex: index,
				}),
			);
			const album: CanonicalAlbum = {
				id: albumDetails.id,
				title: albumDetails.name,
				artist: albumDetails.artists?.[0]?.name ?? "Unknown",
				tracks,
				sourceIds: [
					{ source: "ytmusic" as const, id: albumDetails.id },
				],
				...(albumDetails.year != null
					? { year: albumDetails.year }
					: {}),
				...(albumDetails.thumbnailUrl != null
					? { artworkUrl: albumDetails.thumbnailUrl }
					: {}),
			};
			return { album, tracks };
		},

		async getStreamUrl(trackId: string): Promise<string> {
			return ytdlp.getAudioUrl(trackId);
		},
	};
}
