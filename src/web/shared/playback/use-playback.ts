/**
 * @module usePlayback
 * Audio playback hook with server synchronization.
 * Manages HTML Audio element and syncs state with server via SSE subscriptions.
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiPlayerState } from "../../../api/contracts/player.js";
import {
	clientLogWriteMutationAtom,
	playerAudioErrorReportMutationAtom,
	playerDurationReportMutationAtom,
	playerPauseMutationAtom,
	playerPlayMutationAtom,
	playerPreviousMutationAtom,
	playerProgressReportMutationAtom,
	playerResumeMutationAtom,
	playerSeekMutationAtom,
	playerSkipMutationAtom,
	playerStateStreamAtom,
	playerStopMutationAtom,
	playerTrackEndedMutationAtom,
} from "./playerAtoms";
import type {
	PlaybackContextValue,
	PlaybackQueueContext,
	PlaybackQueueRequest,
	PlaybackTrack,
} from "./types";

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
function getCurrentStationToken(context: PlaybackQueueContext): string | null {
	switch (context.type) {
		case "radio":
			return context.seedId;
		case "album":
			return context.albumId;
		case "playlist":
			return context.playlistId;
		case "manual":
			return null;
	}
}

export function usePlayback(): PlaybackContextValue {
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
	const handleServerStateRef = useRef<
		(state: ServerState, source?: string) => void
	>(() => {});
	// Track whether we've handled the first SSE state after page load.
	// We only suppress autoplay for a newly loaded track during that first sync,
	// not on later reconnects for the same session.
	const hasReceivedInitialStateRef = useRef(false);
	// Track the latest server progress for seek-on-resume
	const serverProgressRef = useRef(0);

	type ServerState = ApiPlayerState;

	const playerStateResult = useAtomValue(playerStateStreamAtom);
	const reportProgress = useAtomSet(playerProgressReportMutationAtom, {
		mode: "promiseExit",
	});
	const reportDuration = useAtomSet(playerDurationReportMutationAtom, {
		mode: "promiseExit",
	});
	const reportAudioError = useAtomSet(playerAudioErrorReportMutationAtom, {
		mode: "promiseExit",
	});
	const trackEnded = useAtomSet(playerTrackEndedMutationAtom, {
		mode: "promiseExit",
	});
	const clientLogWrite = useAtomSet(clientLogWriteMutationAtom, {
		mode: "promiseExit",
	});

	/** Fire-and-forget log to server playback.log */
	const logToServer = useCallback(
		(message: string) => {
			void clientLogWrite({ payload: { message } });
		},
		[clientLogWrite],
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
			void reportDuration({ payload: { duration: audio.duration } });
		};
		const onEnded = () => {
			logToServer("[audio] track ended, calling trackEnded mutation");
			setState((prev) => ({ ...prev, isPlaying: false }));
			void trackEnded({ payload: {} }).then((exit) => {
				if (exit._tag === "Success") {
					handleServerStateRef.current(exit.value, "trackEnded-response");
				}
			});
		};
		const onError = () => {
			const mediaError = audio.error;
			// MEDIA_ERR_ABORTED is expected during track transitions (src changed while loading)
			if (mediaError?.code === MediaError.MEDIA_ERR_ABORTED) {
				logToServer(
					`[audio] MEDIA_ERR_ABORTED silenced (transition expected) src=${audio.src}`,
				);
				return;
			}
			let message = "Audio playback failed";
			if (mediaError) {
				const codeMessages: Record<number, string> = {
					[MediaError.MEDIA_ERR_ABORTED]: "Playback aborted",
					[MediaError.MEDIA_ERR_NETWORK]: "Network error loading audio",
					[MediaError.MEDIA_ERR_DECODE]: "Audio decoding error",
					[MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]:
						"Audio format not supported",
				};
				message = codeMessages[mediaError.code] ?? message;
				if (mediaError.message) {
					message += `: ${mediaError.message}`;
				}
			}
			logToServer(
				`[audio] error code=${mediaError?.code ?? "unknown"} message=${message} src=${audio.src}`,
			);
			void reportAudioError({ payload: { message } });
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
	}, [logToServer, reportAudioError, reportDuration, trackEnded]);

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
				void reportAudioError({ payload: { message } });
				setState((prev) => ({
					...prev,
					isPlaying: false,
					error: message,
				}));
			});
		},
		[logToServer, reportAudioError],
	);

	// Shared handler for server player state — called from both SSE and mutation responses
	const handleServerState = useCallback(
		(serverState: ServerState, source: string = "sse") => {
			const audio = audioRef.current;
			if (!audio) return;

			const track = serverState.currentTrack;
			const isInitialState =
				source === "sse" && !hasReceivedInitialStateRef.current;

			// Always keep server progress ref updated
			serverProgressRef.current = serverState.progress;

			logToServer(
				`[${source}] received status=${serverState.status} track=${track?.id ?? "none"} progress=${String(serverState.progress)} initial=${String(isInitialState)}`,
			);

			if (isInitialState) {
				hasReceivedInitialStateRef.current = true;
			}

			if (track) {
				// Load new audio if the stream URL changed (ignore ?next= prefetch hint)
				const baseUrl = track.streamUrl.split("?")[0];
				const lastBaseUrl = lastStreamUrlRef.current?.split("?")[0] ?? null;
				logToServer(
					`[${source}] baseUrl comparison: base=${baseUrl} last=${lastBaseUrl} changed=${String(baseUrl !== lastBaseUrl)}`,
				);

				if (baseUrl !== lastBaseUrl) {
					// New track
					lastStreamUrlRef.current = track.streamUrl;
					audio.src = track.streamUrl;

					// Seek to server progress for mid-track handoff
					seekAudioTo(audio, serverState.progress);

					if (isInitialState) {
						// On the first SSE sync after page load, don't auto-play a newly loaded track.
						logToServer(
							`[${source}] → FIRST SSE state: load track, show paused at ${String(serverState.progress)}s`,
						);
					} else if (serverState.status === "playing") {
						logToServer(`[${source}] → LOAD new src + play() (status=playing)`);
						safePlay(audio, "new track load");
					} else {
						logToServer(
							`[${source}] → LOAD new src (status=${serverState.status}, not playing)`,
						);
					}
				} else {
					// Same track — sync play/pause state
					if (isInitialState) {
						if (serverState.status === "playing") {
							if (audio.paused) {
								const delta = Math.abs(
									audio.currentTime - serverState.progress,
								);
								if (delta > 2) {
									logToServer(
										`[${source}] → FIRST SSE state: same track paused locally, seek ${String(audio.currentTime)}→${String(serverState.progress)} (delta=${String(delta)})`,
									);
									seekAudioTo(audio, serverState.progress);
								}
								logToServer(
									`[${source}] → FIRST SSE state: same track, resume because server=playing`,
								);
								safePlay(audio, "initial same track resume");
							} else {
								logToServer(
									`[${source}] → FIRST SSE state: same track already playing, keep playing`,
								);
							}
						} else if (serverState.status === "paused") {
							logToServer(
								`[${source}] → FIRST SSE state: same track, seek to ${String(serverState.progress)}s, show paused`,
							);
							seekAudioTo(audio, serverState.progress);
							if (!audio.paused) {
								audio.pause();
							}
						} else {
							logToServer(`[${source}] → FIRST SSE state: same track, stop`);
							audio.pause();
							audio.currentTime = 0;
						}
					} else if (serverState.status === "playing" && audio.paused) {
						// Another device started playing — apply progress threshold to avoid jitter
						const delta = Math.abs(audio.currentTime - serverState.progress);
						if (delta > 2) {
							logToServer(
								`[${source}] → SAME track: seek ${String(audio.currentTime)}→${String(serverState.progress)} (delta=${String(delta)})`,
							);
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
						logToServer(
							`[${source}] → SAME track: no action needed (server=${serverState.status} paused=${String(audio.paused)})`,
						);
					}
				}

				// Sync volume
				audio.volume = serverState.volume / 100;

				const suppressAutoplayOnInitialLoad =
					isInitialState && baseUrl !== lastBaseUrl;

				setState((prev) => ({
					...prev,
					currentTrack: {
						trackToken: track.id,
						songName: track.title,
						artistName: track.artist,
						albumName: track.album,
						audioUrl: track.streamUrl,
						...(track.artworkUrl ? { artUrl: track.artworkUrl } : {}),
					},
					// Suppress autoplay only for a newly loaded track on first connect.
					// Reconnects for the same in-flight track should preserve playing state.
					isPlaying: suppressAutoplayOnInitialLoad
						? false
						: serverState.status === "playing",
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

	// Subscribe to server player state changes through Effect RPC. The atom
	// runtime owns stream connection lifecycle and republishes the latest state.
	useEffect(() => {
		if (AsyncResult.isSuccess(playerStateResult)) {
			handleServerState(playerStateResult.value, "sse");
		}
	}, [playerStateResult, handleServerState]);

	// Periodically report progress to server (every 5s while playing)
	useEffect(() => {
		if (!state.isPlaying) return;
		const interval = setInterval(() => {
			const audio = audioRef.current;
			if (audio && !audio.paused) {
				void reportProgress({ payload: { progress: audio.currentTime } });
			}
		}, 5000);
		return () => clearInterval(interval);
	}, [state.isPlaying, reportProgress]);

	// --- Server mutation wrappers ---
	const pause = useAtomSet(playerPauseMutationAtom, { mode: "promiseExit" });
	const resume = useAtomSet(playerResumeMutationAtom, { mode: "promiseExit" });
	const seekRemote = useAtomSet(playerSeekMutationAtom, {
		mode: "promiseExit",
	});
	const skip = useAtomSet(playerSkipMutationAtom, { mode: "promiseExit" });
	const previous = useAtomSet(playerPreviousMutationAtom, {
		mode: "promiseExit",
	});
	const stopRemote = useAtomSet(playerStopMutationAtom, {
		mode: "promiseExit",
	});
	const playRemote = useAtomSet(playerPlayMutationAtom, {
		mode: "promiseExit",
	});

	const togglePlayPause = useCallback(() => {
		if (state.isPlaying) {
			logToServer("[action] togglePlayPause → pause");
			const audio = audioRef.current;
			if (audio) {
				serverProgressRef.current = audio.currentTime;
				audio.pause();
			}
			setState((prev) => ({ ...prev, isPlaying: false }));
			void pause({ payload: undefined });
		} else {
			logToServer("[action] togglePlayPause → resume");
			const audio = audioRef.current;
			if (audio) {
				// Seek to server progress before playing — handles handoff from another device
				const delta = Math.abs(audio.currentTime - serverProgressRef.current);
				if (delta > 2) {
					logToServer(
						`[action] seek before resume: ${String(audio.currentTime)}→${String(serverProgressRef.current)} (delta=${String(delta)})`,
					);
					audio.currentTime = serverProgressRef.current;
				}
				safePlay(audio, "togglePlayPause resume");
			}
			setState((prev) => ({ ...prev, isPlaying: true }));
			void resume({ payload: undefined });
		}
	}, [state.isPlaying, pause, resume, logToServer, safePlay]);

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
		void stopRemote({ payload: undefined });
	}, [stopRemote]);

	const seek = useCallback(
		(time: number) => {
			const audio = audioRef.current;
			if (audio) {
				seekingRef.current = true;
				audio.currentTime = time;
				setState((prev) => ({ ...prev, progress: time }));
				void seekRemote({ payload: { position: time } });
				setTimeout(() => {
					seekingRef.current = false;
				}, 200);
			}
		},
		[seekRemote],
	);

	const setCurrentStationToken = useCallback((token: string | null) => {
		setState((prev) => ({ ...prev, currentStationToken: token }));
	}, []);

	const triggerSkip = useCallback(() => {
		logToServer("[action] skip");
		void skip({ payload: undefined }).then((exit) => {
			if (exit._tag === "Success") {
				handleServerState(exit.value, "skip-response");
			}
		});
	}, [skip, logToServer, handleServerState]);

	const triggerPrevious = useCallback(() => {
		logToServer("[action] previous");
		void previous({ payload: undefined }).then((exit) => {
			if (exit._tag === "Success") {
				handleServerState(exit.value, "prev-response");
			}
		});
	}, [previous, logToServer, handleServerState]);

	const playTrack = useCallback(
		(track: PlaybackTrack) => {
			logToServer(
				`[action] playTrack id=${track.trackToken} url=${track.audioUrl}`,
			);
			const audio = audioRef.current;
			if (!audio) return;
			audio.src = track.audioUrl;
			lastStreamUrlRef.current = track.audioUrl;
			audio.play().catch((err: unknown) => {
				// AbortError is expected when src changes during play()
				if (err instanceof DOMException && err.name === "AbortError") {
					logToServer(
						"[audio] play() AbortError silenced (transition expected)",
					);
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
		},
		[logToServer],
	);

	const playQueue = useCallback(
		({ tracks, context, startIndex }: PlaybackQueueRequest) => {
			setCurrentStationToken(getCurrentStationToken(context));
			void playRemote({
				payload: {
					tracks: [...tracks],
					context,
					...(startIndex === undefined ? {} : { startIndex }),
				},
			}).then((exit) => {
				if (exit._tag === "Success") {
					handleServerState(exit.value, "play-response");
				} else {
					logToServer("[action] play mutation failed");
					setState((prev) => ({
						...prev,
						error: "Playback failed",
					}));
				}
			});
		},
		[playRemote, setCurrentStationToken, handleServerState, logToServer],
	);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, []);

	const status = state.currentTrack
		? state.isPlaying
			? "playing"
			: "paused"
		: "stopped";

	return {
		status,
		currentTrack: state.currentTrack,
		currentStationToken: state.currentStationToken,
		isPlaying: state.isPlaying,
		progress: state.progress,
		duration: state.duration,
		error: state.error,
		volume: state.volume,
		playTrack,
		playQueue,
		togglePlayPause,
		stop,
		seek,
		triggerSkip,
		triggerPrevious,
		clearError,
	};
}
