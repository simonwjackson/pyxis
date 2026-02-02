import { Effect } from "effect";
import type { PandoraSession } from "./client.js";
import * as Pandora from "./client.js";
import type {
	Source,
	CanonicalTrack,
	CanonicalPlaylist,
} from "../types.js";
import type { PlaylistItem, Station } from "./types/api.js";

export type PandoraSource = Source & {
	registerPlaylistItems: (items: readonly PlaylistItem[]) => void;
};

export function isPandoraSource(source: Source): source is PandoraSource {
	return source.type === "pandora" && typeof (source as Partial<PandoraSource>).registerPlaylistItems === "function";
}

function playlistItemToCanonical(item: PlaylistItem): CanonicalTrack {
	const track: CanonicalTrack = {
		id: item.trackToken,
		title: item.songName,
		artist: item.artistName,
		album: item.albumName,
		sourceId: { source: "pandora", id: item.trackToken },
	};
	if (item.albumArtUrl != null) {
		return { ...track, artworkUrl: item.albumArtUrl };
	}
	return track;
}

function stationToCanonicalPlaylist(station: Station): CanonicalPlaylist {
	const playlist: CanonicalPlaylist = {
		id: station.stationToken,
		name: station.stationName,
		source: "pandora",
	};
	if (station.isQuickMix) {
		return { ...playlist, description: "Shuffle" };
	}
	return playlist;
}

// Resolve the best audio URL from a Pandora playlist item
function resolveAudioUrl(item: PlaylistItem): string | undefined {
	if (typeof item.additionalAudioUrl === "string") {
		return item.additionalAudioUrl;
	}
	if (Array.isArray(item.additionalAudioUrl) && item.additionalAudioUrl.length > 0) {
		return item.additionalAudioUrl[0];
	}
	return (
		item.audioUrlMap?.highQuality?.audioUrl ??
		item.audioUrlMap?.mediumQuality?.audioUrl ??
		item.audioUrlMap?.lowQuality?.audioUrl
	);
}

export function createPandoraSource(session: PandoraSession): PandoraSource {
	// Cache playlist items by track token for stream URL resolution
	const trackCache = new Map<string, PlaylistItem>();

	return {
		type: "pandora",
		name: "Pandora",

		registerPlaylistItems(items: readonly PlaylistItem[]) {
			for (const item of items) {
				trackCache.set(item.trackToken, item);
			}
		},

		async listPlaylists(): Promise<readonly CanonicalPlaylist[]> {
			const result = await Effect.runPromise(
				Pandora.getStationList(session),
			);
			return result.stations.map(stationToCanonicalPlaylist);
		},

		async getPlaylistTracks(
			playlistId: string,
		): Promise<readonly CanonicalTrack[]> {
			const result = await Effect.runPromise(
				Pandora.getPlaylistWithQuality(session, playlistId, "high"),
			);
			// Cache items for stream URL resolution
			for (const item of result.items) {
				trackCache.set(item.trackToken, item);
			}
			return result.items.map(playlistItemToCanonical);
		},

		async getStreamUrl(trackId: string): Promise<string> {
			const cached = trackCache.get(trackId);
			if (cached) {
				const url = resolveAudioUrl(cached);
				if (url) return url;
			}
			throw new Error(
				`No stream URL available for Pandora track "${trackId}". Tracks must be fetched via getPlaylistTracks first.`,
			);
		},

		async search(query: string) {
			const result = await Effect.runPromise(
				Pandora.search(session, query),
			);
			return {
				tracks: (result.songs ?? []).map((song) => ({
					id: song.musicToken,
					title: song.songName,
					artist: song.artistName,
					album: "",
					sourceId: {
						source: "pandora" as const,
						id: song.musicToken,
					},
				})),
				albums: [],
			};
		},
	};
}
