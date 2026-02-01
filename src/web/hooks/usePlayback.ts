import { useState, useRef, useCallback, useEffect } from "react";
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
	});

	useEffect(() => {
		const audio = new Audio();
		audioRef.current = audio;

		const onTimeUpdate = () => {
			setState((prev) => ({ ...prev, progress: audio.currentTime }));
		};
		const onDurationChange = () => {
			setState((prev) => ({ ...prev, duration: audio.duration }));
		};
		const onEnded = () => {
			setState((prev) => ({ ...prev, isPlaying: false }));
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
	}, []);

	const playTrack = useCallback((track: PlaybackTrack) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.src = track.audioUrl;
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

	const togglePlayPause = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) {
			audio.play().catch((err: unknown) => {
				const message = err instanceof Error ? err.message : "Playback failed";
				console.error("[usePlayback] play() rejected:", message);
				setState((prev) => ({
					...prev,
					isPlaying: false,
					error: message,
				}));
			});
			setState((prev) => ({ ...prev, isPlaying: true, error: null }));
		} else {
			audio.pause();
			setState((prev) => ({ ...prev, isPlaying: false }));
		}
	}, []);

	const stop = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.pause();
		audio.currentTime = 0;
		setState({
			currentTrack: null,
			currentStationToken: null,
			isPlaying: false,
			progress: 0,
			duration: 0,
			error: null,
		});
	}, []);

	const seek = useCallback((time: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = time;
		setState((prev) => ({ ...prev, progress: time }));
	}, []);

	const setCurrentStationToken = useCallback((token: string | null) => {
		setState((prev) => ({ ...prev, currentStationToken: token }));
	}, []);

	const triggerSkip = useCallback(() => {
		onTrackEndRef.current?.();
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
		clearError,
	};
}
