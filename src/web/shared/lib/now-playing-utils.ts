/**
 * @module NowPlayingUtils
 * Utility types and functions for the Now Playing feature.
 * Provides track normalization and queue payload conversion.
 */

/**
 * Capability flags indicating what actions are available for a track.
 * Pandora tracks have additional capabilities like feedback and sleep.
 */
export type TrackCapabilities = {
	/** Can give thumbs up/down feedback */
	readonly feedback: boolean;
	/** Can temporarily hide from station (30 days) */
	readonly sleep: boolean;
	/** Can bookmark song or artist */
	readonly bookmark: boolean;
	/** Can explain why track was selected */
	readonly explain: boolean;
	/** Can create radio station from track */
	readonly radio: boolean;
};

/**
 * Unified track representation for the Now Playing display.
 * All source-specific tracks are normalized to this shape.
 */
export type NowPlayingTrack = {
	/** Opaque track ID (source:trackId format) */
	readonly id: string;
	/** Track title */
	readonly songName: string;
	/** Artist name */
	readonly artistName: string;
	/** Album name */
	readonly albumName: string;
	/** Album artwork URL */
	readonly albumArtUrl?: string;
	/** Available actions for this track */
	readonly capabilities: TrackCapabilities;
	/** Duration in seconds */
	readonly duration?: number;
};

/**
 * Converts a radio/station track to the unified NowPlayingTrack format.
 *
 * @param track - Radio track from server with id, title, artist, album fields
 * @returns Normalized NowPlayingTrack
 */
export function radioTrackToNowPlaying(track: {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly artworkUrl?: string | null;
	readonly duration?: number | null;
	readonly capabilities: TrackCapabilities;
}): NowPlayingTrack {
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName: track.album,
		...(track.artworkUrl != null ? { albumArtUrl: track.artworkUrl } : {}),
		...(track.duration != null ? { duration: track.duration } : {}),
		capabilities: track.capabilities,
	};
}

/**
 * Converts a playlist track to the unified NowPlayingTrack format.
 *
 * @param track - Playlist track from server with id, title, artist, album fields
 * @returns Normalized NowPlayingTrack
 */
export function playlistTrackToNowPlaying(track: {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly artworkUrl?: string;
	readonly duration?: number;
	readonly capabilities: TrackCapabilities;
}): NowPlayingTrack {
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName: track.album,
		...(track.artworkUrl != null ? { albumArtUrl: track.artworkUrl } : {}),
		...(track.duration != null ? { duration: track.duration } : {}),
		capabilities: track.capabilities,
	};
}

/**
 * Album track row type from database/API.
 * Used for converting album tracks to NowPlayingTrack format.
 */
export type AlbumTrackRow = {
	readonly id: string;
	readonly trackIndex: number;
	readonly title: string;
	readonly artist: string;
	readonly duration: number | null;
	readonly artworkUrl: string | null;
	readonly capabilities: TrackCapabilities;
};

/**
 * Converts an album track row to the unified NowPlayingTrack format.
 *
 * @param track - Album track row with id, trackIndex, title, artist, duration
 * @param albumName - Name of the album containing this track
 * @param albumArtUrl - Fallback artwork URL if track has no artwork
 * @returns Normalized NowPlayingTrack
 */
export function albumTrackToNowPlaying(
	track: AlbumTrackRow,
	albumName: string,
	albumArtUrl: string | null,
): NowPlayingTrack {
	const artUrl = track.artworkUrl ?? albumArtUrl;
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName,
		...(artUrl != null ? { albumArtUrl: artUrl } : {}),
		capabilities: track.capabilities,
		...(track.duration != null ? { duration: track.duration } : {}),
	};
}

/**
 * Converts an array of NowPlayingTracks to queue API payload format.
 *
 * @param tracks - Array of NowPlayingTracks to convert
 * @returns Array of queue track objects matching server queue.play input
 */
export function tracksToQueuePayload(tracks: readonly NowPlayingTrack[]) {
	return tracks.map((t) => ({
		id: t.id,
		title: t.songName,
		artist: t.artistName,
		album: t.albumName,
		duration: t.duration ?? null,
		artworkUrl: t.albumArtUrl ?? null,
	}));
}

/**
 * Shuffles an array using Fisher-Yates algorithm.
 * Returns a new shuffled array without modifying the original.
 *
 * @param arr - Array to shuffle
 * @returns New shuffled array
 */
export function shuffleArray<T>(arr: readonly T[]): T[] {
	const shuffled = [...arr];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
	}
	return shuffled;
}

/**
 * Formats seconds as MM:SS display string.
 *
 * @param seconds - Time in seconds to format
 * @returns Formatted time string (e.g., "3:45")
 */
export function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}
