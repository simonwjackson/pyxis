/**
 * @module CommandPalette
 * Keyboard-driven command palette for quick actions and navigation.
 * Supports command search, theme selection, and playback controls.
 */

import { useAtomSet } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  libraryBookmarkAddMutationAtom,
  trackFeedbackAddMutationAtom,
  trackSleepSetMutationAtom,
} from "../commands/trackCommandAtoms";
import { usePlaybackContext } from "../playback/playback-context";
import { useTheme } from "../theme/theme-context";
import { CommandPaletteCommandListPanel } from "./command-palette/components/CommandPaletteCommandListPanel";
import { CommandPaletteFooter } from "./command-palette/components/CommandPaletteFooter";
import { CommandPaletteHeader } from "./command-palette/components/CommandPaletteHeader";
import { CommandPaletteThemeListPanel } from "./command-palette/components/CommandPaletteThemeListPanel";
import type {
  CommandPaletteActivePanel,
  CommandPaletteProps,
} from "./command-palette/types";

/**
 * Modal command palette with search, keyboard navigation, and theme selection.
 * Open with Cmd/Ctrl+K. Navigate with arrow keys, select with Enter, close with Escape.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activePanel, setActivePanel] =
    useState<CommandPaletteActivePanel>("commands");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { theme: currentTheme, setTheme } = useTheme();
  const playback = usePlaybackContext();
  const navigate = useNavigate();

  const submitFeedback = useAtomSet(trackFeedbackAddMutationAtom, {
    mode: "promiseExit",
  });
  const submitSleep = useAtomSet(trackSleepSetMutationAtom, {
    mode: "promiseExit",
  });
  const submitBookmark = useAtomSet(libraryBookmarkAddMutationAtom, {
    mode: "promiseExit",
  });

  const executeAction = useCallback(
    (action: string) => {
      onClose();
      switch (action) {
        case "playPause":
          playback.togglePlayPause();
          break;
        case "skipTrack":
          playback.triggerSkip();
          break;
        case "likeTrack":
          if (playback.currentTrack && playback.currentStationToken) {
            void submitFeedback({
              payload: {
                id: playback.currentTrack.trackToken,
                radioId: playback.currentStationToken,
                positive: true,
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("track liked");
            });
          }
          break;
        case "dislikeTrack":
          if (playback.currentTrack && playback.currentStationToken) {
            void submitFeedback({
              payload: {
                id: playback.currentTrack.trackToken,
                radioId: playback.currentStationToken,
                positive: false,
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("track disliked");
            });
            playback.triggerSkip();
          }
          break;
        case "sleepTrack":
          if (playback.currentTrack) {
            void submitSleep({
              payload: { id: playback.currentTrack.trackToken },
            }).then((exit) => {
              if (exit._tag === "Success")
                toast.success("track will be skipped for 30 days");
            });
            playback.triggerSkip();
          }
          break;
        case "bookmarkSong":
          if (playback.currentTrack) {
            void submitBookmark({
              payload: {
                id: playback.currentTrack.trackToken,
                type: "song",
              },
            }).then((exit) => {
              if (exit._tag === "Success") toast.success("song bookmarked");
            });
          }
          break;
        case "goToStations":
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
          navigate({ to: "/search" });
          break;
        case "goToBookmarks":
          navigate({ to: "/bookmarks" });
          break;
        case "goToGenres":
          navigate({ to: "/genres" });
          break;
        case "goToSettings":
          navigate({ to: "/settings" });
          break;
      }
    },
    [onClose, playback, navigate, submitFeedback, submitSleep, submitBookmark],
  );

  useEffect(() => {
    setQuery("");
    setActivePanel("commands");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop closes on click; Escape handling is registered globally while the palette is open.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
      onKeyDown={() => {}}
    >
      <div className="fixed inset-0 bg-black/60" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <CommandPaletteHeader
          inputRef={inputRef}
          query={query}
          onQueryChange={setQuery}
        />

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {activePanel === "commands" ? (
            <CommandPaletteCommandListPanel
              query={query}
              listRef={listRef}
              onExecute={executeAction}
              onOpenThemes={() => setActivePanel("themes")}
              onClose={onClose}
            />
          ) : (
            <CommandPaletteThemeListPanel
              listRef={listRef}
              currentTheme={currentTheme}
              onSelect={(name) => {
                setTheme(name);
                onClose();
              }}
              onBack={() => setActivePanel("commands")}
              onClose={onClose}
              query={query}
            />
          )}
        </div>

        <CommandPaletteFooter />
      </div>
    </div>
  );
}
