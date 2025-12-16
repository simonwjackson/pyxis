import { Effect } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSession } from "../../cli/cache/session.js";
import { getPlaylist } from "../../client.js";
import { getAudioUrl } from "../../quality.js";
import { log } from "../utils/logger.js";
import { usePlayback } from "./usePlayback.js";

// Track type matching the API response
type Track = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly trackLength?: number;
	readonly rating?: number;
};

// Station type
type Station = {
	readonly stationId: string;
	readonly stationName: string;
};

// Queue state exposed to consumers
type QueueState = {
	readonly currentStation: Station | null;
	readonly currentTrack: Track | null;
	readonly queue: readonly Track[];
	readonly isPlaying: boolean;
	readonly isPaused: boolean;
	readonly isLoading: boolean;
	readonly error: string | null;
	readonly position: number;
	readonly duration: number;
};

type UseQueueResult = {
	readonly state: QueueState;
	readonly playStation: (station: Station) => void;
	readonly skip: () => void;
	readonly togglePause: () => void;
	readonly stop: () => void;
	readonly likeTrack: () => void;
	readonly dislikeTrack: () => void;
};

// Configuration
const REFILL_THRESHOLD = 2; // Fetch more when queue drops below this
const QUALITY = "high" as const;

/**
 * Hook to manage the playback queue with automatic advancement and refill.
 * Encapsulates all queue state to avoid stale closure issues.
 */
export function useQueue(): UseQueueResult {
	// Internal state - all queue-related state lives here
	const [currentStation, setCurrentStation] = useState<Station | null>(null);
	const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
	const [queue, setQueue] = useState<readonly Track[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Track URL cache - maps trackToken to audio URL
	const trackUrlsRef = useRef<Map<string, string>>(new Map());

	// Ref to track if we're currently fetching more tracks (prevent duplicate fetches)
	const isFetchingRef = useRef(false);

	// Refs for latest state (used in callbacks to avoid stale closures)
	const queueRef = useRef(queue);
	const currentStationRef = useRef(currentStation);

	// Keep refs in sync with state
	useEffect(() => {
		queueRef.current = queue;
	}, [queue]);
	useEffect(() => {
		currentStationRef.current = currentStation;
	}, [currentStation]);

	// Fetch playlist from API
	const fetchPlaylist = useCallback(
		async (stationId: string): Promise<readonly Track[]> => {
			log("Fetching playlist for station:", stationId);

			const session = await getSession();
			if (!session) {
				throw new Error("Not logged in");
			}

			const result = await Effect.runPromise(
				getPlaylist(session, { stationToken: stationId }).pipe(Effect.either),
			);

			if (result._tag === "Left") {
				throw new Error("Failed to fetch playlist");
			}

			const items = result.right.items;
			log(`Fetched ${items.length} tracks`);

			// Cache audio URLs and convert to Track format
			const tracks: Track[] = [];
			for (const item of items) {
				const url = getAudioUrl(item, QUALITY);
				if (url) {
					trackUrlsRef.current.set(item.trackToken, url);
					tracks.push({
						trackToken: item.trackToken,
						songName: item.songName,
						artistName: item.artistName,
						albumName: item.albumName ?? "Unknown Album",
					});
				}
			}

			log(`Cached ${tracks.length} audio URLs`);
			return tracks;
		},
		[],
	);

	// Refill queue when it runs low
	const refillQueue = useCallback(async () => {
		const station = currentStationRef.current;
		if (!station || isFetchingRef.current) {
			return;
		}

		isFetchingRef.current = true;
		log("Refilling queue...");

		try {
			const newTracks = await fetchPlaylist(station.stationId);
			setQueue((prev) => [...prev, ...newTracks]);
			setError(null);
		} catch (err) {
			log("Failed to refill queue:", err);
			setError("Failed to fetch more tracks");
		} finally {
			isFetchingRef.current = false;
		}
	}, [fetchPlaylist]);

	// Advance to next track - called when current track ends
	// Returns the audio URL for the next track, or null if queue is empty
	const advanceToNextTrack = useCallback((): string | null => {
		const currentQueue = queueRef.current;
		log("Advancing to next track, queue length:", currentQueue.length);

		if (currentQueue.length === 0) {
			log("Queue empty, triggering refill and waiting...");
			// Trigger refill, playback will resume when tracks arrive
			refillQueue();
			return null;
		}

		const nextTrack = currentQueue[0];
		const remainingQueue = currentQueue.slice(1);

		log("Next track:", nextTrack?.songName);
		setCurrentTrack(nextTrack ?? null);
		setQueue(remainingQueue);

		// Check if we need to refill (proactive)
		if (remainingQueue.length < REFILL_THRESHOLD) {
			log("Queue below threshold, triggering refill");
			refillQueue();
		}

		// Return the audio URL for the next track
		if (nextTrack) {
			return trackUrlsRef.current.get(nextTrack.trackToken) ?? null;
		}
		return null;
	}, [refillQueue]);

	// Handle track end event from usePlayback
	const handleTrackEnd = useCallback(() => {
		log("Track ended, advancing...");
		advanceToNextTrack();
		// Note: actual playback is triggered by the useEffect watching currentTrack
	}, [advanceToNextTrack]);

	// Initialize playback hook with our track end handler
	const playback = usePlayback({ onTrackEnd: handleTrackEnd });

	// Play the current track when it changes
	const lastPlayedTokenRef = useRef<string | null>(null);
	useEffect(() => {
		const token = currentTrack?.trackToken ?? null;
		if (token && token !== lastPlayedTokenRef.current) {
			const audioUrl = trackUrlsRef.current.get(token);
			if (audioUrl) {
				log("Playing track:", currentTrack?.songName);
				lastPlayedTokenRef.current = token;
				playback.play(audioUrl);
			} else {
				log("No audio URL for track:", token);
			}
		}
	}, [currentTrack, playback]);

	// When queue gets new tracks and we have no current track, start playing
	useEffect(() => {
		if (!currentTrack && queue.length > 0 && currentStation) {
			log("Queue populated, starting playback of first track");
			advanceToNextTrack();
		}
	}, [queue, currentTrack, currentStation, advanceToNextTrack]);

	// Play a station - fetches playlist and starts playback
	const playStation = useCallback(
		async (station: Station) => {
			log("Playing station:", station.stationName);
			setIsLoading(true);
			setError(null);
			setCurrentStation(station);
			setCurrentTrack(null);
			setQueue([]);
			lastPlayedTokenRef.current = null; // Reset to allow playing first track
			trackUrlsRef.current.clear(); // Clear old URLs

			try {
				const tracks = await fetchPlaylist(station.stationId);

				if (tracks.length === 0) {
					throw new Error("No tracks available");
				}

				// Set first track as current, rest as queue
				const [firstTrack, ...rest] = tracks;
				setCurrentTrack(firstTrack ?? null);
				setQueue(rest);
				setIsLoading(false);
			} catch (err) {
				log("Failed to play station:", err);
				setError(err instanceof Error ? err.message : "Failed to load station");
				setIsLoading(false);
				setCurrentTrack(null);
				setQueue([]);
			}
		},
		[fetchPlaylist],
	);

	// Skip to next track
	const skip = useCallback(() => {
		log("Skip requested");
		advanceToNextTrack();
	}, [advanceToNextTrack]);

	// Toggle pause
	const togglePause = useCallback(() => {
		if (playback.state.isPlaying) {
			playback.togglePause();
		}
	}, [playback]);

	// Stop playback
	const stop = useCallback(() => {
		log("Stop requested");
		playback.stop();
		setCurrentTrack(null);
		setQueue([]);
		setCurrentStation(null);
		lastPlayedTokenRef.current = null;
	}, [playback]);

	// Like current track (placeholder - needs API integration)
	const likeTrack = useCallback(() => {
		if (currentTrack) {
			log("Like track:", currentTrack.songName);
			setCurrentTrack((prev) => (prev ? { ...prev, rating: 1 } : null));
			// TODO: Call API to submit feedback
		}
	}, [currentTrack]);

	// Dislike current track - skips to next
	const dislikeTrack = useCallback(() => {
		if (currentTrack) {
			log("Dislike track:", currentTrack.songName);
			// TODO: Call API to submit feedback
			skip();
		}
	}, [currentTrack, skip]);

	// Compose the state object
	const state: QueueState = {
		currentStation,
		currentTrack,
		queue,
		isPlaying: playback.state.isPlaying,
		isPaused: playback.state.isPaused,
		isLoading,
		error,
		position: playback.state.position,
		duration: playback.state.duration,
	};

	return {
		state,
		playStation,
		skip,
		togglePause,
		stop,
		likeTrack,
		dislikeTrack,
	};
}

export type { Track, Station, QueueState, UseQueueResult };
