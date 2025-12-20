import { useCallback, useEffect, useRef, useState } from "react";
import { useInput, type Key } from "ink";
import { log } from "../utils/logger.js";

const LEADER_TIMEOUT_MS = 1000;

interface LeaderCommands {
	readonly theme: () => void;
	readonly quality: () => void;
	readonly account: () => void;
	readonly bookmarks: () => void;
	readonly refresh: () => void;
	readonly genres: () => void;
}

interface KeybindConfig {
	// Global
	readonly quit?: () => void;
	readonly help?: () => void;
	readonly commandPalette?: () => void;

	// Navigation
	readonly moveUp?: () => void;
	readonly moveDown?: () => void;
	readonly goToTop?: () => void;
	readonly goToBottom?: () => void;
	readonly select?: () => void;
	readonly back?: () => void;
	readonly search?: () => void;

	// View switching
	readonly nowPlaying?: () => void;
	readonly goBack?: () => void;
	readonly bookmarks?: () => void;

	// Station management
	readonly createStation?: () => void;
	readonly deleteStation?: () => void;
	readonly renameStation?: () => void;
	readonly filterStations?: () => void;
	readonly manageSeeds?: () => void;

	// Playback
	readonly playPause?: () => void;
	readonly nextTrack?: () => void;
	readonly like?: () => void;
	readonly dislike?: () => void;
	readonly sleep?: () => void;
	readonly trackInfo?: () => void;
	readonly bookmarkArtist?: () => void;
	readonly bookmarkSong?: () => void;

	// Debug
	readonly toggleLog?: () => void;

	// Leader key commands (ctrl+x prefix)
	readonly leader?: Partial<LeaderCommands>;
}

interface UseKeybindsOptions {
	readonly enabled?: boolean;
}

interface UseKeybindsResult {
	readonly isLeaderActive: boolean;
	readonly leaderKey: string | null;
}

type LeaderKeyMap = {
	readonly [K in keyof LeaderCommands]: string;
};

const LEADER_KEY_MAP: LeaderKeyMap = {
	theme: "t",
	quality: "q",
	account: "a",
	bookmarks: "b",
	refresh: "r",
	genres: "g",
};

export function useKeybinds(
	config: KeybindConfig,
	options: UseKeybindsOptions = {},
): UseKeybindsResult {
	const { enabled = true } = options;

	const [isLeaderActive, setIsLeaderActive] = useState(false);
	const [leaderKey, setLeaderKey] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearLeaderState = useCallback(() => {
		setIsLeaderActive(false);
		setLeaderKey(null);
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const activateLeaderMode = useCallback(() => {
		setIsLeaderActive(true);
		setLeaderKey("ctrl+x");

		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		timeoutRef.current = setTimeout(() => {
			clearLeaderState();
		}, LEADER_TIMEOUT_MS);
	}, [clearLeaderState]);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	const handleLeaderCommand = useCallback(
		(input: string): boolean => {
			if (!config.leader) return false;

			for (const [command, key] of Object.entries(LEADER_KEY_MAP)) {
				if (input === key) {
					const handler = config.leader[command as keyof LeaderCommands];
					if (handler) {
						handler();
						return true;
					}
				}
			}
			return false;
		},
		[config.leader],
	);

	const handleInput = useCallback(
		(input: string, key: Key) => {
			log("keypress", { input, key: JSON.stringify(key) });

			// Handle leader key activation (ctrl+x)
			if (key.ctrl && input === "x") {
				activateLeaderMode();
				return;
			}

			// Handle leader key follow-up commands
			if (isLeaderActive) {
				handleLeaderCommand(input);
				clearLeaderState();
				return;
			}

			// Global commands
			if (input === "q" || (key.ctrl && input === "c")) {
				config.quit?.();
				return;
			}
			if (input === "?") {
				config.help?.();
				return;
			}
			if (input === ":") {
				config.commandPalette?.();
				return;
			}

			// Navigation - vim style
			if (input === "j" || key.downArrow) {
				config.moveDown?.();
				return;
			}
			if (input === "k" || key.upArrow) {
				config.moveUp?.();
				return;
			}
			if (input === "g") {
				config.goToTop?.();
				return;
			}
			if (input === "G") {
				config.goToBottom?.();
				return;
			}
			if (key.return) {
				log("Enter key detected", { input, hasSelectHandler: !!config.select });
				config.select?.();
				return;
			}
			// Escape: goBack takes priority for view switching, falls back to back
			if (key.escape) {
				if (config.goBack) {
					config.goBack();
				} else {
					config.back?.();
				}
				return;
			}
			if (input === "h" || key.leftArrow) {
				config.back?.();
				return;
			}
			if (input === "/") {
				config.search?.();
				return;
			}

			// Playback
			if (input === " ") {
				config.playPause?.();
				return;
			}
			// View switching: n for now playing (when handler defined), otherwise nextTrack
			if (input === "n") {
				if (config.nowPlaying) {
					config.nowPlaying();
				} else {
					config.nextTrack?.();
				}
				return;
			}
			if (input === "b") {
				config.bookmarks?.();
				return;
			}
			if (key.rightArrow) {
				config.nextTrack?.();
				return;
			}
			if (input === "+") {
				config.like?.();
				return;
			}
			if (input === "-") {
				config.dislike?.();
				return;
			}
			if (input === "z") {
				config.sleep?.();
				return;
			}
			if (input === "i") {
				config.trackInfo?.();
				return;
			}
			if (input === "B") {
				config.bookmarkSong?.();
				return;
			}
			if (input === "A") {
				config.bookmarkArtist?.();
				return;
			}

			// Station management
			if (input === "c") {
				config.createStation?.();
				return;
			}
			if (input === "x") {
				config.deleteStation?.();
				return;
			}
			if (input === "r") {
				config.renameStation?.();
				return;
			}
			if (input === "f") {
				config.filterStations?.();
				return;
			}
			if (input === "s") {
				config.manageSeeds?.();
				return;
			}

			// Debug
			if (input === "@") {
				config.toggleLog?.();
				return;
			}
		},
		[
			config,
			isLeaderActive,
			activateLeaderMode,
			clearLeaderState,
			handleLeaderCommand,
		],
	);

	useInput(handleInput, { isActive: enabled });

	return {
		isLeaderActive,
		leaderKey,
	};
}

export type { KeybindConfig, UseKeybindsOptions, UseKeybindsResult };
