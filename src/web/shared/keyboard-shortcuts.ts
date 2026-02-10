/**
 * @module KeyboardShortcuts
 * Global keyboard shortcut handling hook.
 * Manages playback controls, navigation, and UI toggles via keyboard.
 */

import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { matchShortcut } from "./lib/shortcuts";
import { usePlaybackContext } from "./playback/playback-context";
import { trpc } from "./lib/trpc";

/**
 * Handler callbacks for keyboard shortcut actions.
 */
type KeyboardShortcutHandlers = {
	/** Callback to open the command palette */
	readonly onCommandPalette: () => void;
	/** Callback to toggle the help overlay */
	readonly onToggleHelp: () => void;
};

/**
 * Hook that registers global keyboard shortcuts for playback and navigation.
 * Handles actions like play/pause, skip, like/dislike, bookmarking, and navigation.
 * Shortcuts are disabled when typing in input fields (except Escape and Cmd/Ctrl+K).
 *
 * @param handlers - Callbacks for command palette and help toggle
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   onCommandPalette: () => setCommandOpen(true),
 *   onToggleHelp: () => setHelpOpen(!helpOpen),
 * });
 * ```
 */
export function useKeyboardShortcuts({ onCommandPalette, onToggleHelp }: KeyboardShortcutHandlers) {
	const navigate = useNavigate();
	const playback = usePlaybackContext();
	const handlersRef = useRef({ onCommandPalette, onToggleHelp });
	handlersRef.current = { onCommandPalette, onToggleHelp };

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_data, variables) {
			toast.success(variables.positive ? "Track liked" : "Track disliked");
		},
		onError(err) {
			toast.error(`Feedback failed: ${err.message}`);
		},
	});

	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`Sleep failed: ${err.message}`);
		},
	});

	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
		onError(err) {
			toast.error(`Bookmark failed: ${err.message}`);
		},
	});

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const shortcut = matchShortcut(e);
			if (!shortcut) return;

			switch (shortcut.action) {
				case "commandPalette":
					e.preventDefault();
					handlersRef.current.onCommandPalette();
					break;
				case "toggleHelp":
					e.preventDefault();
					handlersRef.current.onToggleHelp();
					break;
				case "escape":
					// Escape is handled by modals/dialogs themselves
					break;
				case "playPause":
					e.preventDefault();
					playback.togglePlayPause();
					break;
				case "skipTrack":
					e.preventDefault();
					playback.triggerSkip();
					break;
				case "likeTrack":
					e.preventDefault();
					if (playback.currentTrack && playback.currentStationToken) {
						feedbackMutation.mutate({
							id: playback.currentTrack.trackToken,
							radioId: playback.currentStationToken,
							positive: true,
						});
					}
					break;
				case "dislikeTrack":
					e.preventDefault();
					if (playback.currentTrack && playback.currentStationToken) {
						feedbackMutation.mutate({
							id: playback.currentTrack.trackToken,
							radioId: playback.currentStationToken,
							positive: false,
						});
						playback.triggerSkip();
					}
					break;
				case "sleepTrack":
					e.preventDefault();
					if (playback.currentTrack) {
						sleepMutation.mutate({ id: playback.currentTrack.trackToken });
						playback.triggerSkip();
					}
					break;
				case "trackInfo":
					// Handled by NowPlayingPage directly
					break;
				case "bookmarkSong":
					e.preventDefault();
					if (playback.currentTrack) {
						bookmarkSongMutation.mutate({ id: playback.currentTrack.trackToken, type: "song" });
					}
					break;
				case "bookmarkArtist":
					// Would require artist token, skip for now
					break;
				case "goToStations":
					e.preventDefault();
					navigate({ to: "/" });
					break;
				case "goToSearch":
					e.preventDefault();
					navigate({ to: "/search" });
					break;
				case "goToBookmarks":
					e.preventDefault();
					navigate({ to: "/bookmarks" });
					break;
				case "goToGenres":
					e.preventDefault();
					navigate({ to: "/genres" });
					break;
				case "goToSettings":
					e.preventDefault();
					navigate({ to: "/settings" });
					break;
			}
		},
		[playback, navigate, feedbackMutation, sleepMutation, bookmarkSongMutation],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}
