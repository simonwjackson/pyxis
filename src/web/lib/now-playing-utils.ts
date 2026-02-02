// Capability flags from server
export type TrackCapabilities = {
	readonly feedback: boolean;
	readonly sleep: boolean;
	readonly bookmark: boolean;
	readonly explain: boolean;
	readonly radio: boolean;
};

// Unified track shape — all IDs are opaque
export type NowPlayingTrack = {
	readonly id: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly capabilities: TrackCapabilities;
	readonly duration?: number;
};

// Convert a radio track to NowPlayingTrack
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

// Convert a playlist track to NowPlayingTrack
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

// Convert an album track row to NowPlayingTrack
export type AlbumTrackRow = {
	readonly id: string;
	readonly trackIndex: number;
	readonly title: string;
	readonly artist: string;
	readonly duration: number | null;
	readonly artworkUrl: string | null;
	readonly capabilities: TrackCapabilities;
};

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

export function shuffleArray<T>(arr: readonly T[]): T[] {
	const shuffled = [...arr];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
	}
	return shuffled;
}

export function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}
