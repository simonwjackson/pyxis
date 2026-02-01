import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "../lib/trpc";
import type { SourceType } from "../../sources/types.js";

export type PlaybackTrack = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly audioUrl: string;
	readonly artUrl?: string;
	readonly source?: SourceType;
};

type PlaybackState = {
	readonly currentTrack: PlaybackTrack | null;
	readonly currentStationToken: string | null;
	readonly isPlaying: boolean;
	readonly progress: number;
	readonly duration: number;
	readonly error: string | null;
	readonly volume: number;
};

export function usePlayback() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const onTrackEndRef = useRef<(() => void) | null>(null);
	const [state, setState] = useState<PlaybackState>({
		currentTrack: null,
		currentStationToken: null,
		isPlaying: false,
		progress: 0,
		duration: 0,
		error: null,
		volume: 100,
	});

	// Track the last stream URL to avoid reloading same track
	const lastStreamUrlRef = useRef<string | null>(null);
	const seekingRef = useRef(false);

	const reportProgress = trpc.player.reportProgress.useMutation();
	const reportDuration = trpc.player.reportDuration.useMutation();
	const trackEndedMutation = trpc.player.trackEnded.useMutation();

	// Initialize audio element once
	useEffect(() => {
		const audio = new Audio();
		audioRef.current = audio;

		const onTimeUpdate = () => {
			if (!seekingRef.current) {
				setState((prev) => ({ ...prev, progress: audio.currentTime }));
			}
		};
		const onDurationChange = () => {
			setState((prev) => ({ ...prev, duration: audio.duration }));
			reportDuration.mutate({ duration: audio.duration });
		};
		const onEnded = () => {
			setState((prev) => ({ ...prev, isPlaying: false }));
			trackEndedMutation.mutate();
			onTrackEndRef.current?.();
		};
		const onError = () => {
			const mediaError = audio.error;
			let message = "Audio playback failed";
			if (mediaError) {
				const codeMessages: Record<number, string> = {
					[MediaError.MEDIA_ERR_ABORTED]: "Playback aborted",
					[MediaError.MEDIA_ERR_NETWORK]: "Network error loading audio",
					[MediaError.MEDIA_ERR_DECODE]: "Audio decoding error",
					[MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: "Audio format not supported",
				};
				message = codeMessages[mediaError.code] ?? message;
				if (mediaError.message) {
					message += `: ${mediaError.message}`;
				}
			}
			console.error("[usePlayback] Audio error:", message, audio.src);
			setState((prev) => ({
				...prev,
				isPlaying: false,
				error: message,
			}));
		};

		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("durationchange", onDurationChange);
		audio.addEventListener("ended", onEnded);
		audio.addEventListener("error", onError);

		return () => {
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("durationchange", onDurationChange);
			audio.removeEventListener("ended", onEnded);
			audio.removeEventListener("error", onError);
			audio.pause();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Subscribe to server player state changes via SSE
	trpc.player.onStateChange.useSubscription(undefined, {
		onData(serverState) {
			const audio = audioRef.current;
			if (!audio) return;

			const track = serverState.currentTrack;

			if (track) {
				// Load new audio if the stream URL changed
				if (track.streamUrl !== lastStreamUrlRef.current) {
					lastStreamUrlRef.current = track.streamUrl;
					audio.src = track.streamUrl;

					if (serverState.status === "playing") {
						audio.play().catch((err: unknown) => {
							const message = err instanceof Error ? err.message : "Playback failed";
							console.error("[usePlayback] play() rejected:", message);
							setState((prev) => ({
								...prev,
								isPlaying: false,
								error: message,
							}));
						});
					}
				} else {
					// Same track — sync play/pause state
					if (serverState.status === "playing" && audio.paused) {
						audio.play().catch((err: unknown) => {
							console.error("[usePlayback] resume rejected:", err);
						});
					} else if (serverState.status === "paused" && !audio.paused) {
						audio.pause();
					} else if (serverState.status === "stopped") {
						audio.pause();
						audio.currentTime = 0;
					}
				}

				// Sync volume
				audio.volume = serverState.volume / 100;

				setState((prev) => ({
					...prev,
					currentTrack: {
						trackToken: track.id,
						songName: track.title,
						artistName: track.artist,
						albumName: track.album,
						audioUrl: track.streamUrl,
						artUrl: track.artworkUrl ?? undefined,
					},
					isPlaying: serverState.status === "playing",
					volume: serverState.volume,
				}));
			} else {
				// No track — stopped
				if (!audio.paused) {
					audio.pause();
				}
				lastStreamUrlRef.current = null;
				setState((prev) => ({
					...prev,
					currentTrack: null,
					isPlaying: false,
					progress: 0,
					duration: 0,
				}));
			}
		},
	});

	// Periodically report progress to server (every 5s while playing)
	useEffect(() => {
		if (!state.isPlaying) return;
		const interval = setInterval(() => {
			const audio = audioRef.current;
			if (audio && !audio.paused) {
				reportProgress.mutate({ progress: audio.currentTime });
			}
		}, 5000);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state.isPlaying]);

	// --- Server mutation wrappers ---
	const pauseMutation = trpc.player.pause.useMutation();
	const resumeMutation = trpc.player.resume.useMutation();
	const seekMutation = trpc.player.seek.useMutation();
	const skipMutation = trpc.player.skip.useMutation();
	const previousMutation = trpc.player.previous.useMutation();
	const stopMutation = trpc.player.stop.useMutation();
	const playMutation = trpc.player.play.useMutation();
	const jumpToMutation = trpc.player.jumpTo.useMutation();

	const togglePlayPause = useCallback(() => {
		if (state.isPlaying) {
			const audio = audioRef.current;
			if (audio) audio.pause();
			setState((prev) => ({ ...prev, isPlaying: false }));
			pauseMutation.mutate();
		} else {
			const audio = audioRef.current;
			if (audio) {
				audio.play().catch(() => {});
			}
			setState((prev) => ({ ...prev, isPlaying: true }));
			resumeMutation.mutate();
		}
	}, [state.isPlaying, pauseMutation, resumeMutation]);

	const stop = useCallback(() => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
		}
		lastStreamUrlRef.current = null;
		setState((prev) => ({
			...prev,
			currentTrack: null,
			currentStationToken: null,
			isPlaying: false,
			progress: 0,
			duration: 0,
			error: null,
		}));
		stopMutation.mutate();
	}, [stopMutation]);

	const seek = useCallback(
		(time: number) => {
			const audio = audioRef.current;
			if (audio) {
				seekingRef.current = true;
				audio.currentTime = time;
				setState((prev) => ({ ...prev, progress: time }));
				seekMutation.mutate({ position: time });
				setTimeout(() => {
					seekingRef.current = false;
				}, 200);
			}
		},
		[seekMutation],
	);

	const setCurrentStationToken = useCallback((token: string | null) => {
		setState((prev) => ({ ...prev, currentStationToken: token }));
	}, []);

	const triggerSkip = useCallback(() => {
		skipMutation.mutate();
		onTrackEndRef.current?.();
	}, [skipMutation]);

	const triggerPrevious = useCallback(() => {
		previousMutation.mutate();
	}, [previousMutation]);

	const playTrack = useCallback((track: PlaybackTrack) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.src = track.audioUrl;
		lastStreamUrlRef.current = track.audioUrl;
		audio.play().catch((err: unknown) => {
			const message = err instanceof Error ? err.message : "Playback failed";
			console.error("[usePlayback] play() rejected:", message);
			setState((prev) => ({
				...prev,
				isPlaying: false,
				error: message,
			}));
		});
		setState((prev) => ({
			...prev,
			currentTrack: track,
			isPlaying: true,
			progress: 0,
			duration: 0,
			error: null,
		}));
	}, []);

	const setOnTrackEnd = useCallback((callback: (() => void) | null) => {
		onTrackEndRef.current = callback;
	}, []);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, []);

	return {
		...state,
		playTrack,
		togglePlayPause,
		stop,
		seek,
		setCurrentStationToken,
		setOnTrackEnd,
		triggerSkip,
		triggerPrevious,
		clearError,
		playMutation,
		jumpToMutation,
	};
}
