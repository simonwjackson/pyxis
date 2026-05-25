import type { PlayerState } from "../services/player.js";

export type PlayerStateViewTrack = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly duration: number | null;
	readonly artworkUrl: string | null;
};

export type PlayerStateView = {
	readonly status: PlayerState["status"];
	readonly currentTrack: PlayerStateViewTrack | null;
	readonly progress: number;
	readonly duration: number;
	readonly updatedAt: number;
};

export function toPlayerStateView(state: PlayerState): PlayerStateView {
	const track = state.currentTrack;
	return {
		status: state.status,
		currentTrack: track
			? {
					id: track.id,
					title: track.title,
					artist: track.artist,
					album: track.album,
					duration: track.duration,
					artworkUrl: track.artworkUrl,
				}
			: null,
		progress: state.progress,
		duration: state.duration,
		updatedAt: state.updatedAt,
	};
}
