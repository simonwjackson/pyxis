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

/**
 * Hook to manage mpv playback with IPC for pause/resume
 */
export function usePlayback(): UsePlaybackResult {
	const [state, setState] = useState<PlaybackState>({
		isPlaying: false,
		isPaused: false,
		currentUrl: null,
		error: null,
	});

	const mpvProcess = useRef<ChildProcess | null>(null);
	const ipcSocket = useRef<Socket | null>(null);
	const isSupported = useRef<boolean | null>(null);

	// Send command to mpv via IPC
	const sendCommand = useCallback((command: string[]) => {
		if (!ipcSocket.current) {
			log("IPC socket not connected");
			return;
		}
		const msg = JSON.stringify({ command }) + "\n";
		log("sending mpv command", command);
		ipcSocket.current.write(msg);
	}, []);

	// Connect to mpv IPC socket
	const connectIpc = useCallback(() => {
		// Small delay to let mpv create the socket
		setTimeout(() => {
			const socket = createConnection(SOCKET_PATH);

			socket.on("connect", () => {
				log("IPC connected");
				ipcSocket.current = socket;
			});

			socket.on("error", (err) => {
				log("IPC error", err.message);
				ipcSocket.current = null;
			});

			socket.on("close", () => {
				log("IPC closed");
				ipcSocket.current = null;
			});
		}, 200);
	}, []);

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
	}, []);

	const stop = useCallback(() => {
		log("stop called");
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
		}));
	}, []);

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
