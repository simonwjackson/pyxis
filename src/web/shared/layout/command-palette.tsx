/**
 * @module CommandPalette
 * Keyboard-driven command palette for quick actions and navigation.
 * Supports command search, theme selection, and playback controls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { usePlaybackContext } from "../playback/playback-context";
import { useTheme } from "../theme/theme-context";
import { CommandPaletteCommandListPanel } from "./command-palette/components/CommandPaletteCommandListPanel";
import { CommandPaletteFooter } from "./command-palette/components/CommandPaletteFooter";
import { CommandPaletteHeader } from "./command-palette/components/CommandPaletteHeader";
import { CommandPaletteThemeListPanel } from "./command-palette/components/CommandPaletteThemeListPanel";
import type { CommandPaletteActivePanel, CommandPaletteProps } from "./command-palette/types";

/**
 * Modal command palette with search, keyboard navigation, and theme selection.
 * Open with Cmd/Ctrl+K. Navigate with arrow keys, select with Enter, close with Escape.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [activePanel, setActivePanel] = useState<CommandPaletteActivePanel>("commands");
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const { theme: currentTheme, setTheme } = useTheme();
	const playback = usePlaybackContext();
	const navigate = useNavigate();

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_data, variables) {
			toast.success(variables.positive ? "track liked" : "track disliked");
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("track will be skipped for 30 days");
		},
	});
	const bookmarkMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("song bookmarked");
		},
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
						feedbackMutation.mutate({
							id: playback.currentTrack.trackToken,
							radioId: playback.currentStationToken,
							positive: true,
						});
					}
					break;
				case "dislikeTrack":
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
					if (playback.currentTrack) {
						sleepMutation.mutate({ id: playback.currentTrack.trackToken });
						playback.triggerSkip();
					}
					break;
				case "bookmarkSong":
					if (playback.currentTrack) {
						bookmarkMutation.mutate({ id: playback.currentTrack.trackToken, type: "song" });
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
		[onClose, playback, navigate, feedbackMutation, sleepMutation, bookmarkMutation],
	);

	useEffect(() => {
		setQuery("");
		setActivePanel("commands");
		requestAnimationFrame(() => inputRef.current?.focus());
	}, []);

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
			onClick={onClose}
			onKeyDown={() => {}}
		>
			<div className="fixed inset-0 bg-black/60" />
			<div
				className="relative w-full max-w-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
				onClick={(event) => event.stopPropagation()}
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
