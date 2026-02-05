/**
 * @module usePlayback
 * Audio playback hook with server synchronization.
 * Manages HTML Audio element and syncs state with server via SSE subscriptions.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "../lib/trpc";
import type { SourceType } from "../../../sources/types.js";

/**
 * Track information for playback.
 */
export type PlaybackTrack = {
	/** Opaque track token (source:trackId format) */
	readonly trackToken: string;
	/** Track title */
	readonly songName: string;
	/** Artist name */
	readonly artistName: string;
	/** Album name */
	readonly albumName: string;
	/** Direct audio stream URL */
	readonly audioUrl: string;
	/** Album artwork URL */
	readonly artUrl?: string;
	/** Source backend (pandora, ytmusic, etc.) */
	readonly source?: SourceType;
};

/**
 * Internal playback state.
 */
type PlaybackState = {
	/** Currently playing track, or null if stopped */
	readonly currentTrack: PlaybackTrack | null;
	/** Current station token (for Pandora radio context) */
	readonly currentStationToken: string | null;
	/** Whether audio is currently playing */
	readonly isPlaying: boolean;
	/** Current playback position in seconds */
	readonly progress: number;
	/** Total track duration in seconds */
	readonly duration: number;
	/** Error message if playback failed, null otherwise */
	readonly error: string | null;
	/** Volume level from 0-100 */
	readonly volume: number;
};

/**
 * Main playback hook providing audio controls and server synchronization.
 * Manages HTML Audio element lifecycle, SSE state subscriptions, and server mutations.
 *
 * @returns Playback state and control functions
 *
 * @example
 * ```tsx
 * const { isPlaying, togglePlayPause, currentTrack, seek } = usePlayback();
 * ```
 */
export function usePlayback() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
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
	const handleServerStateRef = useRef<(state: ServerState, source?: string) => void>(() => {});
	// Track whether the first SSE state has been received (to suppress auto-play on connect)
	const hasReceivedInitialStateRef = useRef(false);
	// Track the latest server progress for seek-on-resume
	const serverProgressRef = useRef(0);

	type ServerTrack = {
		readonly id: string;
		readonly title: string;
		readonly artist: string;
		readonly album: string;
		readonly duration: number | null;
		readonly artworkUrl: string | null;
		readonly streamUrl: string;
	};

	type ServerState = {
		readonly status: "playing" | "paused" | "stopped";
		readonly currentTrack: ServerTrack | null;
		readonly progress: number;
		readonly duration: number;
		readonly volume: number;
		readonly updatedAt: number;
	};

	const reportProgress = trpc.player.reportProgress.useMutation();
	const reportDuration = trpc.player.reportDuration.useMutation();
	const trackEndedMutation = trpc.player.trackEnded.useMutation();
	const clientLog = trpc.log.client.useMutation();

	/** Fire-and-forget log to server playback.log */
	const logToServer = useCallback(
		(message: string) => {
			clientLog.mutate({ message });
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

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
			logToServer("[audio] track ended, calling trackEnded mutation");
			setState((prev) => ({ ...prev, isPlaying: false }));
			trackEndedMutation.mutate(undefined, {
				onSuccess(data) {
					handleServerStateRef.current(data, "trackEnded-response");
				},
			});
		};
		const onError = () => {
			const mediaError = audio.error;
			// MEDIA_ERR_ABORTED is expected during track transitions (src changed while loading)
			if (mediaError?.code === MediaError.MEDIA_ERR_ABORTED) {
				logToServer(`[audio] MEDIA_ERR_ABORTED silenced (transition expected) src=${audio.src}`);
				return;
			}
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
			logToServer(`[audio] error code=${mediaError?.code ?? "unknown"} message=${message} src=${audio.src}`);
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

	/** Seek audio to a position once playable, handling both loaded and loading states */
	const seekAudioTo = useCallback(
		(audio: HTMLAudioElement, position: number) => {
			if (position <= 0) return;
			if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
				audio.currentTime = position;
			} else {
				const onCanPlay = () => {
					audio.removeEventListener("canplay", onCanPlay);
					audio.currentTime = position;
				};
				audio.addEventListener("canplay", onCanPlay);
			}
		},
		[],
	);

	/** Safely call audio.play() with standard error handling */
	const safePlay = useCallback(
		(audio: HTMLAudioElement, context: string) => {
			audio.play().catch((err: unknown) => {
				if (err instanceof DOMException && err.name === "AbortError") {
					logToServer(`[audio] play() AbortError silenced (${context})`);
					return;
				}
				if (err instanceof DOMException && err.name === "NotAllowedError") {
					logToServer(`[audio] play() blocked by autoplay policy (${context})`);
					setState((prev) => ({ ...prev, isPlaying: false }));
					return;
				}
				const message = err instanceof Error ? err.message : "Playback failed";
				logToServer(`[audio] play() rejected (${context}): ${message}`);
				setState((prev) => ({
					...prev,
					isPlaying: false,
					error: message,
				}));
			});
		},
		[logToServer],
	);

	// Shared handler for server player state — called from both SSE and mutation responses
	const handleServerState = useCallback(
		(serverState: ServerState, source: string = "sse") => {
			const audio = audioRef.current;
			if (!audio) return;

			const track = serverState.currentTrack;
			const isInitialState = source === "sse" && !hasReceivedInitialStateRef.current;

			// Always keep server progress ref updated
			serverProgressRef.current = serverState.progress;

			logToServer(`[${source}] received status=${serverState.status} track=${track?.id ?? "none"} progress=${String(serverState.progress)} initial=${String(isInitialState)}`);

			if (isInitialState) {
				hasReceivedInitialStateRef.current = true;
			}

			if (track) {
				// Load new audio if the stream URL changed (ignore ?next= prefetch hint)
				const baseUrl = track.streamUrl.split("?")[0];
				const lastBaseUrl = lastStreamUrlRef.current?.split("?")[0] ?? null;
				logToServer(`[${source}] baseUrl comparison: base=${baseUrl} last=${lastBaseUrl} changed=${String(baseUrl !== lastBaseUrl)}`);

				if (baseUrl !== lastBaseUrl) {
					// New track
					lastStreamUrlRef.current = track.streamUrl;
					audio.src = track.streamUrl;

					// Seek to server progress for mid-track handoff
					seekAudioTo(audio, serverState.progress);

					if (isInitialState) {
						// On initial SSE connect: always show paused regardless of server status
						logToServer(`[${source}] → INITIAL: load track, show paused at ${String(serverState.progress)}s`);
					} else if (serverState.status === "playing") {
						logToServer(`[${source}] → LOAD new src + play() (status=playing)`);
						safePlay(audio, "new track load");
					} else {
						logToServer(`[${source}] → LOAD new src (status=${serverState.status}, not playing)`);
					}
				} else {
					// Same track — sync play/pause state
					if (isInitialState) {
						// On initial SSE connect with same track already loaded: seek and show paused
						logToServer(`[${source}] → INITIAL: same track, seek to ${String(serverState.progress)}s, show paused`);
						seekAudioTo(audio, serverState.progress);
					} else if (serverState.status === "playing" && audio.paused) {
						// Another device started playing — apply progress threshold to avoid jitter
						const delta = Math.abs(audio.currentTime - serverState.progress);
						if (delta > 2) {
							logToServer(`[${source}] → SAME track: seek ${String(audio.currentTime)}→${String(serverState.progress)} (delta=${String(delta)})`);
							audio.currentTime = serverState.progress;
						}
						logToServer(`[${source}] → SAME track: resume (paused→playing)`);
						safePlay(audio, "same track resume");
					} else if (serverState.status === "paused" && !audio.paused) {
						logToServer(`[${source}] → SAME track: pause (playing→paused)`);
						audio.pause();
					} else if (serverState.status === "stopped") {
						logToServer(`[${source}] → SAME track: stop`);
						audio.pause();
						audio.currentTime = 0;
					} else {
						logToServer(`[${source}] → SAME track: no action needed (server=${serverState.status} paused=${String(audio.paused)})`);
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
					// On initial connect, always show paused
					isPlaying: isInitialState ? false : serverState.status === "playing",
					progress: isInitialState ? serverState.progress : prev.progress,
					volume: serverState.volume,
				}));
			} else {
				// No track — stopped
				logToServer(`[${source}] → NO track: stopped`);
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
		[logToServer, seekAudioTo, safePlay],
	);

	// Keep ref in sync so audio event listeners always call the latest version
	handleServerStateRef.current = handleServerState;

	// Subscribe to server player state changes via manual EventSource with reconnect.
	// tRPC's useSubscription + httpSubscriptionLink creates EventSource connections
	// that silently die ~15-20s after React StrictMode mount/unmount cycles.
	// Components at the app root (PlaybackProvider) never remount to recover.
	// Manual EventSource gives us full lifecycle control with reconnect on drop.
	useEffect(() => {
		let eventSource: EventSource | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let cancelled = false;
		let reconnectDelay = 1000;
		const MAX_RECONNECT_DELAY = 16000;

		function connect() {
			if (cancelled) return;

			// Reset initial state flag so reconnects also show paused
			hasReceivedInitialStateRef.current = false;

			// tRPC SSE URL: no input param when subscription input is undefined
			eventSource = new EventSource("/trpc/player.onStateChange");

			// tRPC SSE emits a named "connected" event on establishment
			eventSource.addEventListener("connected", () => {
				logToServer("[sse] EventSource connected");
				reconnectDelay = 1000; // Reset backoff on successful connection
			});

			// Data arrives as unnamed SSE events (server emits `data:` without `event:` line),
			// so the standard onmessage handler receives them.
			// The data payload is the JSON-serialized player state directly.
			eventSource.onmessage = (event) => {
				try {
					const serverState = JSON.parse(event.data as string) as ServerState;
					handleServerState(serverState, "sse");
				} catch {
					// Ignore parse errors
				}
			};

			eventSource.onerror = () => {
				logToServer(`[sse] EventSource error, reconnecting in ${String(reconnectDelay)}ms`);
				eventSource?.close();
				eventSource = null;
				if (!cancelled) {
					reconnectTimer = setTimeout(() => {
						reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
						connect();
					}, reconnectDelay);
				}
			};
		}

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			eventSource?.close();
			eventSource = null;
		};
	}, [handleServerState, logToServer]);

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
	const playMutation = trpc.player.play.useMutation({
		onSuccess(data) {
			handleServerState(data, "play-response");
		},
		onError(error) {
			logToServer(`[action] play mutation failed: ${error.message}`);
			setState((prev) => ({
				...prev,
				error: error.message,
			}));
		},
	});
	const jumpToMutation = trpc.player.jumpTo.useMutation();

	const togglePlayPause = useCallback(() => {
		if (state.isPlaying) {
			logToServer("[action] togglePlayPause → pause");
			const audio = audioRef.current;
			if (audio) audio.pause();
			setState((prev) => ({ ...prev, isPlaying: false }));
			pauseMutation.mutate();
		} else {
			logToServer("[action] togglePlayPause → resume");
			const audio = audioRef.current;
			if (audio) {
				// Seek to server progress before playing — handles handoff from another device
				const delta = Math.abs(audio.currentTime - serverProgressRef.current);
				if (delta > 2) {
					logToServer(`[action] seek before resume: ${String(audio.currentTime)}→${String(serverProgressRef.current)} (delta=${String(delta)})`);
					audio.currentTime = serverProgressRef.current;
				}
				safePlay(audio, "togglePlayPause resume");
			}
			setState((prev) => ({ ...prev, isPlaying: true }));
			resumeMutation.mutate();
		}
	}, [state.isPlaying, pauseMutation, resumeMutation, logToServer, safePlay]);

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
		logToServer("[action] skip");
		skipMutation.mutate(undefined, {
			onSuccess(data) {
				handleServerState(data, "skip-response");
			},
		});
	}, [skipMutation, logToServer, handleServerState]);

	const triggerPrevious = useCallback(() => {
		logToServer("[action] previous");
		previousMutation.mutate(undefined, {
			onSuccess(data) {
				handleServerState(data, "prev-response");
			},
		});
	}, [previousMutation, logToServer, handleServerState]);

	const triggerJumpTo = useCallback(
		(index: number) => {
			logToServer(`[action] jumpTo(${String(index)})`);
			jumpToMutation.mutate(
				{ index },
				{
					onSuccess(data) {
						handleServerState(data, "jumpTo-response");
					},
				},
			);
		},
		[jumpToMutation, logToServer, handleServerState],
	);

	const playTrack = useCallback((track: PlaybackTrack) => {
		logToServer(`[action] playTrack id=${track.trackToken} url=${track.audioUrl}`);
		const audio = audioRef.current;
		if (!audio) return;
		audio.src = track.audioUrl;
		lastStreamUrlRef.current = track.audioUrl;
		audio.play().catch((err: unknown) => {
			// AbortError is expected when src changes during play()
			if (err instanceof DOMException && err.name === "AbortError") {
				logToServer("[audio] play() AbortError silenced (transition expected)");
				return;
			}
			const message = err instanceof Error ? err.message : "Playback failed";
			logToServer(`[audio] play() rejected: ${message}`);
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
	}, [logToServer]);

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
		triggerSkip,
		triggerPrevious,
		clearError,
		playMutation,
		triggerJumpTo,
	};
}
