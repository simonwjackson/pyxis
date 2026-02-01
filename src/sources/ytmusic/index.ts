import type {
	Source,
	CanonicalTrack,
	CanonicalPlaylist,
} from "../types.js";
import * as ytdlp from "./yt-dlp.js";

export type YtMusicConfig = {
	readonly playlists: readonly {
		readonly url: string;
		readonly name?: string;
	}[];
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

		async listPlaylists(): Promise<readonly CanonicalPlaylist[]> {
			const results: CanonicalPlaylist[] = [];
			for (const playlist of config.playlists) {
				try {
					const info = await ytdlp.getPlaylistEntries(playlist.url);
					playlistCache.set(info.id, {
						title: playlist.name ?? info.title,
						entries: info.entries.map(entryToCanonical),
					});
					results.push({
						id: info.id,
						name: playlist.name ?? info.title,
						source: "ytmusic",
					});
				} catch {
					// Skip playlists that fail to load
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
			const configEntry = config.playlists.find((p) =>
				p.url.includes(playlistId),
			);
			if (configEntry) {
				const info = await ytdlp.getPlaylistEntries(configEntry.url);
				const entries = info.entries.map(entryToCanonical);
				playlistCache.set(playlistId, {
					title: configEntry.name ?? info.title,
					entries,
				});
				return entries;
			}

			throw new Error(
				`YouTube Music playlist "${playlistId}" not found`,
			);
		},

		async getStreamUrl(trackId: string): Promise<string> {
			return ytdlp.getAudioUrl(trackId);
		},
	};
}
