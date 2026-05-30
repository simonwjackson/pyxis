/**
 * @module KeyboardShortcuts
 * Global keyboard shortcut handling hook.
 * Manages playback controls, navigation, and UI toggles via keyboard.
 */

import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  libraryBookmarkAddMutationAtom,
  trackFeedbackAddMutationAtom,
  trackSleepSetMutationAtom,
} from "./commands/trackCommandAtoms";
import { matchShortcut } from "./lib/shortcuts";
import { usePlaybackContext } from "./playback/PlaybackContext";

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
export function useKeyboardShortcuts({
  onCommandPalette,
  onToggleHelp,
}: KeyboardShortcutHandlers) {
  const navigate = useNavigate();
  const playback = usePlaybackContext();
  const handlersRef = useRef({ onCommandPalette, onToggleHelp });
  handlersRef.current = { onCommandPalette, onToggleHelp };

  const submitFeedback = useAtomSet(trackFeedbackAddMutationAtom, {
    mode: "promiseExit",
  });
  const submitSleep = useAtomSet(trackSleepSetMutationAtom, {
    mode: "promiseExit",
  });
  const submitBookmark = useAtomSet(libraryBookmarkAddMutationAtom, {
    mode: "promiseExit",
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
            void submitFeedback({
              payload: {
                id: playback.currentTrack.trackToken,
                radioId: playback.currentStationToken,
                positive: true,
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("Track liked");
              else toast.error("Feedback failed");
            });
          }
          break;
        case "dislikeTrack":
          e.preventDefault();
          if (playback.currentTrack && playback.currentStationToken) {
            void submitFeedback({
              payload: {
                id: playback.currentTrack.trackToken,
                radioId: playback.currentStationToken,
                positive: false,
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("Track disliked");
              else toast.error("Feedback failed");
            });
            playback.triggerSkip();
          }
          break;
        case "sleepTrack":
          e.preventDefault();
          if (playback.currentTrack) {
            void submitSleep({
              payload: { id: playback.currentTrack.trackToken },
            }).then((exit) => {
              if (exit._tag === "Success")
                toast.success("Track will be skipped for 30 days");
              else toast.error("Sleep failed");
            });
            playback.triggerSkip();
          }
          break;
        case "trackInfo":
          // Handled by NowPlayingPage directly
          break;
        case "bookmarkSong":
          e.preventDefault();
          if (playback.currentTrack) {
            void submitBookmark({
              payload: {
                id: playback.currentTrack.trackToken,
                type: "song",
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("Song bookmarked");
              else toast.error("Bookmark failed");
            });
          }
          break;
        case "bookmarkArtist":
          // Would require artist token, skip for now
          break;
        case "goToStations":
          e.preventDefault();
          navigate({
            to: "/",
            search: {
              pl_sort: undefined,
              pl_page: undefined,
              al_sort: undefined,
              al_page: undefined,
            },
          });
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
    [playback, navigate, submitFeedback, submitSleep, submitBookmark],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
