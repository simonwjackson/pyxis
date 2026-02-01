import { Effect } from "effect";
import * as Pandora from "../../src/client.js";
import type { PandoraSession } from "../../src/client.js";
import type { PlaylistItem } from "../../src/types/api.js";

type PlaybackState = {
	stationToken: string;
	currentTrack: PlaylistItem | null;
	queue: PlaylistItem[];
	state: "playing" | "paused" | "stopped";
};

// Per-session playback state
const playbackStates = new Map<string, PlaybackState>();

export function getPlaybackState(
	sessionId: string,
): PlaybackState | undefined {
	return playbackStates.get(sessionId);
}

export async function startPlayback(
	sessionId: string,
	pandoraSession: PandoraSession,
	stationToken: string,
): Promise<PlaylistItem | null> {
	const result = await Effect.runPromise(
		Pandora.getPlaylistWithQuality(pandoraSession, stationToken, "high"),
	);

	const queue = [...result.items];
	const currentTrack = queue.shift() ?? null;

	playbackStates.set(sessionId, {
		stationToken,
		currentTrack,
		queue,
		state: "playing",
	});

	return currentTrack;
}

export async function skipTrack(
	sessionId: string,
	pandoraSession: PandoraSession,
): Promise<PlaylistItem | null> {
	const state = playbackStates.get(sessionId);
	if (!state) return null;

	if (state.queue.length === 0) {
		// Fetch more tracks
		const result = await Effect.runPromise(
			Pandora.getPlaylistWithQuality(
				pandoraSession,
				state.stationToken,
				"high",
			),
		);
		state.queue = [...result.items];
	}

	const nextTrack = state.queue.shift() ?? null;
	state.currentTrack = nextTrack;
	state.state = nextTrack ? "playing" : "stopped";

	return nextTrack;
}

export function pausePlayback(sessionId: string): void {
	const state = playbackStates.get(sessionId);
	if (state) {
		state.state = "paused";
	}
}

export function resumePlayback(sessionId: string): void {
	const state = playbackStates.get(sessionId);
	if (state && state.currentTrack) {
		state.state = "playing";
	}
}

export function stopPlayback(sessionId: string): void {
	playbackStates.delete(sessionId);
}
