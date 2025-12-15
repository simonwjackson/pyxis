import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { unlinkSync } from "node:fs";
import { useCallback, useEffect, useRef, useState } from "react";
import { log } from "../utils/logger.js";

type PlaybackState = {
	readonly isPlaying: boolean;
	readonly isPaused: boolean;
	readonly currentUrl: string | null;
	readonly error: string | null;
	readonly position: number; // current position in seconds
	readonly duration: number; // total duration in seconds
};

type UsePlaybackOptions = {
	readonly onTrackEnd?: () => void;
};

type UsePlaybackResult = {
	readonly state: PlaybackState;
	readonly play: (url: string) => void;
	readonly pause: () => void;
	readonly resume: () => void;
	readonly stop: () => void;
	readonly togglePause: () => void;
	readonly isSupported: boolean;
};

const SOCKET_PATH = "/tmp/pyxis-mpv-socket";
const POSITION_POLL_INTERVAL = 1000; // Poll every 1 second

/**
 * Hook to manage mpv playback with IPC for pause/resume and position tracking
 */
export function usePlayback(
	options: UsePlaybackOptions = {},
): UsePlaybackResult {
	const { onTrackEnd } = options;
	const [state, setState] = useState<PlaybackState>({
		isPlaying: false,
		isPaused: false,
		currentUrl: null,
		error: null,
		position: 0,
		duration: 0,
	});

	const mpvProcess = useRef<ChildProcess | null>(null);
	const ipcSocket = useRef<Socket | null>(null);
	const isSupported = useRef<boolean | null>(null);
	const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
	const requestId = useRef(0);
	const onTrackEndRef = useRef(onTrackEnd);

	// Keep onTrackEnd ref up to date
	useEffect(() => {
		onTrackEndRef.current = onTrackEnd;
	}, [onTrackEnd]);

	// Send command to mpv via IPC and optionally get response
	const sendCommand = useCallback(
		(command: string[], requestIdNum?: number) => {
			if (!ipcSocket.current) {
				log("IPC socket not connected");
				return;
			}
			const msg =
				requestIdNum !== undefined
					? JSON.stringify({ command, request_id: requestIdNum }) + "\n"
					: JSON.stringify({ command }) + "\n";
			ipcSocket.current.write(msg);
		},
		[],
	);

	// Handle IPC responses
	const handleIpcData = useCallback((data: Buffer) => {
		const lines = data.toString().split("\n").filter(Boolean);
		for (const line of lines) {
			try {
				const response = JSON.parse(line) as {
					request_id?: number;
					data?: number;
					error?: string;
					event?: string;
				};

				// Handle property responses
				if (response.request_id === 1 && typeof response.data === "number") {
					// Position response
					setState((prev) => ({ ...prev, position: response.data ?? 0 }));
				} else if (
					response.request_id === 2 &&
					typeof response.data === "number"
				) {
					// Duration response
					setState((prev) => ({ ...prev, duration: response.data ?? 0 }));
				}

				// Handle end-file event (track finished)
				if (response.event === "end-file") {
					log("Track ended (end-file event)");
					if (onTrackEndRef.current) {
						onTrackEndRef.current();
					}
				}
			} catch {
				// Ignore parse errors for partial data
			}
		}
	}, []);

	// Poll for position and duration
	const startPolling = useCallback(() => {
		if (pollInterval.current) {
			clearInterval(pollInterval.current);
		}
		pollInterval.current = setInterval(() => {
			if (ipcSocket.current) {
				// Request time-pos (position)
				sendCommand(["get_property", "time-pos"], 1);
				// Request duration
				sendCommand(["get_property", "duration"], 2);
			}
		}, POSITION_POLL_INTERVAL);
	}, [sendCommand]);

	const stopPolling = useCallback(() => {
		if (pollInterval.current) {
			clearInterval(pollInterval.current);
			pollInterval.current = null;
		}
	}, []);

	// Connect to mpv IPC socket
	const connectIpc = useCallback(() => {
		// Small delay to let mpv create the socket
		setTimeout(() => {
			const socket = createConnection(SOCKET_PATH);

			socket.on("connect", () => {
				log("IPC connected");
				ipcSocket.current = socket;
				// Start polling for position updates
				startPolling();
			});

			socket.on("data", handleIpcData);

			socket.on("error", (err) => {
				log("IPC error", err.message);
				ipcSocket.current = null;
				stopPolling();
			});

			socket.on("close", () => {
				log("IPC closed");
				ipcSocket.current = null;
				stopPolling();
			});
		}, 200);
	}, [handleIpcData, startPolling, stopPolling]);

	// Check if mpv is available on first render
	useEffect(() => {
		if (isSupported.current === null) {
			const check = spawn("which", ["mpv"]);
			check.on("close", (code) => {
				isSupported.current = code === 0;
			});
		}

		// Cleanup on unmount
		return () => {
			stopPolling();
			if (ipcSocket.current) {
				ipcSocket.current.destroy();
				ipcSocket.current = null;
			}
			if (mpvProcess.current) {
				mpvProcess.current.kill();
				mpvProcess.current = null;
			}
			// Clean up socket file
			try {
				unlinkSync(SOCKET_PATH);
			} catch {
				// Ignore
			}
		};
	}, [stopPolling]);

	const stop = useCallback(() => {
		log("stop called");
		stopPolling();
		if (ipcSocket.current) {
			ipcSocket.current.destroy();
			ipcSocket.current = null;
		}
		if (mpvProcess.current) {
			mpvProcess.current.kill();
			mpvProcess.current = null;
		}
		setState((prev) => ({
			...prev,
			isPlaying: false,
			isPaused: false,
			currentUrl: null,
			position: 0,
			duration: 0,
		}));
	}, [stopPolling]);

	const pause = useCallback(() => {
		log("pause called");
		sendCommand(["set_property", "pause", "yes"]);
		setState((prev) => ({
			...prev,
			isPaused: true,
		}));
	}, [sendCommand]);

	const resume = useCallback(() => {
		log("resume called");
		sendCommand(["set_property", "pause", "no"]);
		setState((prev) => ({
			...prev,
			isPaused: false,
		}));
	}, [sendCommand]);

	const togglePause = useCallback(() => {
		log("togglePause called, isPaused:", state.isPaused);
		if (state.isPaused) {
			resume();
		} else {
			pause();
		}
	}, [state.isPaused, pause, resume]);

	const play = useCallback(
		(url: string) => {
			log("play called", url.slice(0, 50));
			// Stop any existing playback
			if (mpvProcess.current) {
				if (ipcSocket.current) {
					ipcSocket.current.destroy();
					ipcSocket.current = null;
				}
				mpvProcess.current.kill();
				mpvProcess.current = null;
			}

			// Clean up old socket file
			try {
				unlinkSync(SOCKET_PATH);
			} catch {
				// Ignore
			}

			setState({
				isPlaying: true,
				isPaused: false,
				currentUrl: url,
				error: null,
				position: 0,
				duration: 0,
			});

			// Spawn mpv with IPC socket
			const proc = spawn(
				"mpv",
				[
					"--no-video",
					"--really-quiet",
					"--no-terminal",
					`--input-ipc-server=${SOCKET_PATH}`,
					url,
				],
				{
					stdio: ["ignore", "ignore", "pipe"],
				},
			);

			mpvProcess.current = proc;
			log("mpv spawned, pid:", proc.pid);

			// Connect to IPC after a short delay
			connectIpc();

			proc.on("error", (err) => {
				log("mpv error", err.message);
				setState((prev) => ({
					...prev,
					isPlaying: false,
					isPaused: false,
					error: err.message.includes("ENOENT")
						? "mpv not found. Install mpv to enable playback."
						: err.message,
				}));
				mpvProcess.current = null;
			});

			proc.on("close", (code) => {
				log("mpv closed, code:", code);
				// Only update state if this is still the current process
				if (mpvProcess.current === proc) {
					setState((prev) => ({
						...prev,
						isPlaying: false,
						isPaused: false,
						currentUrl: null,
						error:
							code !== 0 && code !== null
								? `mpv exited with code ${code}`
								: prev.error,
					}));
					mpvProcess.current = null;
				}
			});
		},
		[connectIpc],
	);

	return {
		state,
		play,
		pause,
		resume,
		stop,
		togglePause,
		isSupported: isSupported.current ?? true,
	};
}

export type { PlaybackState, UsePlaybackResult };
