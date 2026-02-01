import type {
	Source,
	CanonicalTrack,
	CanonicalPlaylist,
	SearchResult,
	CanonicalAlbum,
} from "../types.js";
import * as ytdlp from "./yt-dlp.js";

export type YtMusicPlaylistEntry = {
	readonly id: string;
	readonly url: string;
	readonly name: string;
	readonly isRadio?: boolean;
};

export type YtMusicConfig = {
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
		title: entry.title,
		artist: entry.uploader ?? "Unknown",
		album: entry.album ?? "",
		sourceId: { source: "ytmusic", id: entry.id },
		...(entry.duration != null ? { duration: entry.duration } : {}),
		...(entry.thumbnail != null ? { artworkUrl: entry.thumbnail } : {}),
	};
}

export function generateRadioUrl(videoId: string): string {
	return `https://music.youtube.com/watch?v=${videoId}&list=RDAMVM${videoId}`;
}

export function createYtMusicSource(config: YtMusicConfig): Source {
	// Cache resolved playlist data
	const playlistCache = new Map<
		string,
		{
			readonly title: string;
			readonly entries: readonly CanonicalTrack[];
		}
	>();

	return {
		type: "ytmusic",
		name: "YouTube Music",

		async search(query: string): Promise<SearchResult> {
			const entries = await ytdlp.searchYtMusic(query, 10);
			const tracks = entries.map(entryToCanonical);
			// yt-dlp ytsearch returns individual videos, not albums
			return { tracks, albums: [] };
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
			const url = `https://music.youtube.com/playlist?list=${albumId}`;
			const info = await ytdlp.getAlbumEntries(url);
			const tracks = info.entries.map((entry, index) => ({
				...entryToCanonical(entry),
				trackIndex: index,
			}));
			const album: CanonicalAlbum = {
				id: albumId,
				title: info.title,
				artist: info.artist,
				tracks,
				sourceIds: [{ source: "ytmusic" as const, id: albumId }],
				...(info.thumbnail != null
					? { artworkUrl: info.thumbnail }
					: {}),
			};
			return { album, tracks };
		},

		async getStreamUrl(trackId: string): Promise<string> {
			return ytdlp.getAudioUrl(trackId);
		},
	};
}
