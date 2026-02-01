import { useState, useRef, useCallback, useEffect } from "react";

type PlaybackTrack = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly audioUrl: string;
	readonly artUrl?: string;
};

type PlaybackState = {
	readonly currentTrack: PlaybackTrack | null;
	readonly currentStationToken: string | null;
	readonly isPlaying: boolean;
	readonly progress: number;
	readonly duration: number;
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

		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("durationchange", onDurationChange);
		audio.addEventListener("ended", onEnded);

		return () => {
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("durationchange", onDurationChange);
			audio.removeEventListener("ended", onEnded);
			audio.pause();
		};
	}, []);

	const playTrack = useCallback((track: PlaybackTrack) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.src = track.audioUrl;
		audio.play();
		setState((prev) => ({
			...prev,
			currentTrack: track,
			isPlaying: true,
			progress: 0,
			duration: 0,
		}));
	}, []);

	const togglePlayPause = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) {
			audio.play();
			setState((prev) => ({ ...prev, isPlaying: true }));
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

	return {
		...state,
		playTrack,
		togglePlayPause,
		stop,
		seek,
		setCurrentStationToken,
		setOnTrackEnd,
		triggerSkip,
	};
}
