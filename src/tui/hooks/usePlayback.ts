import { spawn, type ChildProcess } from "node:child_process";
import { useCallback, useEffect, useRef, useState } from "react";

type PlaybackState = {
	readonly isPlaying: boolean;
	readonly currentUrl: string | null;
	readonly error: string | null;
};

type UsePlaybackResult = {
	readonly state: PlaybackState;
	readonly play: (url: string) => void;
	readonly stop: () => void;
	readonly isSupported: boolean;
};

/**
 * Hook to manage mpv playback
 *
 * Spawns mpv process with audio URL and manages lifecycle
 */
export function usePlayback(): UsePlaybackResult {
	const [state, setState] = useState<PlaybackState>({
		isPlaying: false,
		currentUrl: null,
		error: null,
	});

	const mpvProcess = useRef<ChildProcess | null>(null);
	const isSupported = useRef<boolean | null>(null);

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
			if (mpvProcess.current) {
				mpvProcess.current.kill();
				mpvProcess.current = null;
			}
		};
	}, []);

	const stop = useCallback(() => {
		if (mpvProcess.current) {
			mpvProcess.current.kill();
			mpvProcess.current = null;
		}
		setState((prev) => ({
			...prev,
			isPlaying: false,
			currentUrl: null,
		}));
	}, []);

	const play = useCallback((url: string) => {
		// Stop any existing playback
		if (mpvProcess.current) {
			mpvProcess.current.kill();
			mpvProcess.current = null;
		}

		setState({
			isPlaying: true,
			currentUrl: url,
			error: null,
		});

		// Spawn mpv with the URL
		// --no-video: audio only
		// --really-quiet: minimal output
		// --no-terminal: don't read from terminal (we handle input)
		const proc = spawn(
			"mpv",
			["--no-video", "--really-quiet", "--no-terminal", url],
			{
				stdio: ["ignore", "ignore", "pipe"],
			},
		);

		mpvProcess.current = proc;

		proc.on("error", (err) => {
			setState((prev) => ({
				...prev,
				isPlaying: false,
				error: err.message.includes("ENOENT")
					? "mpv not found. Install mpv to enable playback."
					: err.message,
			}));
			mpvProcess.current = null;
		});

		proc.on("close", (code) => {
			// Only update state if this is still the current process
			if (mpvProcess.current === proc) {
				setState((prev) => ({
					...prev,
					isPlaying: false,
					currentUrl: null,
					// Don't set error on normal exit (code 0) or when killed (null)
					error:
						code !== 0 && code !== null
							? `mpv exited with code ${code}`
							: prev.error,
				}));
				mpvProcess.current = null;
			}
		});
	}, []);

	return {
		state,
		play,
		stop,
		isSupported: isSupported.current ?? true, // Assume supported until proven otherwise
	};
}

export type { PlaybackState, UsePlaybackResult };
