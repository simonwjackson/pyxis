import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
	Search,
	Play,
	SkipForward,
	ThumbsUp,
	ThumbsDown,
	Moon,
	Bookmark,
	Radio,
	LayoutGrid,
	Settings,
	Palette,
	ArrowLeft,
	Check,
} from "lucide-react";
import { toast } from "sonner";
import { filterCommands, groupCommands } from "../../lib/commands";
import { themes, themeNames } from "../../lib/themes";
import { useTheme } from "../../contexts/ThemeContext";
import { usePlaybackContext } from "../../contexts/PlaybackContext";
import { trpc } from "../../lib/trpc";

type CommandPaletteProps = {
	readonly isOpen: boolean;
	readonly onClose: () => void;
};

const iconMap: Record<string, typeof Play> = {
	playPause: Play,
	skipTrack: SkipForward,
	likeTrack: ThumbsUp,
	dislikeTrack: ThumbsDown,
	sleepTrack: Moon,
	bookmarkSong: Bookmark,
	goToStations: Radio,
	goToSearch: Search,
	goToBookmarks: Bookmark,
	goToGenres: LayoutGrid,
	goToSettings: Settings,
	changeTheme: Palette,
};

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [showThemes, setShowThemes] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();
	const { theme: currentTheme, setTheme } = useTheme();
	const playback = usePlaybackContext();

	const feedbackMutation = trpc.track.feedback.useMutation({
		onSuccess(_data, variables) {
			toast.success(variables.positive ? "Track liked" : "Track disliked");
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
	});
	const bookmarkMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
	});

	const filteredCommands = filterCommands(query);
	const grouped = groupCommands(filteredCommands);
	const flatItems = grouped.flatMap((g) => g.commands);

	useEffect(() => {
		if (isOpen) {
			setQuery("");
			setSelectedIndex(0);
			setShowThemes(false);
			// Small delay to ensure DOM is ready
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [isOpen]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [query]);

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
					navigate({ to: "/" });
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

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (showThemes) {
				const themeList = themeNames;
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSelectedIndex((i) => Math.min(i + 1, themeList.length - 1));
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
				} else if (e.key === "Enter") {
					e.preventDefault();
					const name = themeList[selectedIndex];
					if (name) {
						setTheme(name);
						onClose();
					}
				} else if (e.key === "Escape" || e.key === "Backspace") {
					if (e.key === "Backspace" && query.length > 0) return;
					e.preventDefault();
					setShowThemes(false);
					setSelectedIndex(0);
				}
				return;
			}

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const item = flatItems[selectedIndex];
				if (item) {
					if (item.action === "changeTheme") {
						setShowThemes(true);
						setSelectedIndex(themeNames.indexOf(currentTheme));
					} else {
						executeAction(item.action);
					}
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		},
		[showThemes, flatItems, selectedIndex, executeAction, onClose, currentTheme, setTheme, query.length],
	);

	// Scroll selected item into view
	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		const selected = list.querySelector("[data-selected='true']");
		if (selected) {
			selected.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
			onClick={onClose}
			onKeyDown={() => {}}
		>
			<div className="fixed inset-0 bg-black/60" />
			<div
				className="relative w-full max-w-lg bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={handleKeyDown}
			>
				{/* Search input */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
					<Search className="w-5 h-5 text-[var(--color-text-dim)] shrink-0" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Type a command..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="flex-1 bg-transparent text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none text-sm"
					/>
					<kbd className="px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] rounded border border-[var(--color-border)]">
						ESC
					</kbd>
				</div>

				{/* Results */}
				<div ref={listRef} className="max-h-80 overflow-y-auto py-2">
					{showThemes ? (
						<ThemeList
							selectedIndex={selectedIndex}
							currentTheme={currentTheme}
							onSelect={(name) => {
								setTheme(name);
								onClose();
							}}
							onBack={() => {
								setShowThemes(false);
								setSelectedIndex(0);
							}}
						/>
					) : (
						<>
							{grouped.map((group, groupIdx) => {
								const prevCount = grouped
									.slice(0, groupIdx)
									.reduce((sum, g) => sum + g.commands.length, 0);
								return (
									<div key={group.category}>
										<div className="px-3 py-1">
											<p className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-wider">
												{group.category}
											</p>
										</div>
										{group.commands.map((cmd, cmdIdx) => {
											const globalIdx = prevCount + cmdIdx;
											const isSelected = globalIdx === selectedIndex;
											const Icon = iconMap[cmd.id] ?? Search;
											return (
												<button
													key={cmd.id}
													type="button"
													data-selected={isSelected}
													className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
														isSelected
															? "bg-[var(--color-bg-highlight)]"
															: "hover:bg-[var(--color-bg-highlight)]"
													}`}
													onClick={() => {
														if (cmd.action === "changeTheme") {
															setShowThemes(true);
															setSelectedIndex(themeNames.indexOf(currentTheme));
														} else {
															executeAction(cmd.action);
														}
													}}
													onMouseEnter={() => setSelectedIndex(globalIdx)}
												>
													<Icon className={`w-4 h-4 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`} />
													<span className={`flex-1 text-sm ${isSelected ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
														{cmd.label}
													</span>
													{cmd.shortcut && (
														<kbd className="px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] rounded border border-[var(--color-border)]">
															{cmd.shortcut}
														</kbd>
													)}
													{cmd.action === "changeTheme" && (
														<span className="text-[10px] text-[var(--color-text-dim)]">&rarr;</span>
													)}
												</button>
											);
										})}
									</div>
								);
							})}
							{flatItems.length === 0 && (
								<div className="px-4 py-8 text-center text-sm text-[var(--color-text-dim)]">
									No commands found
								</div>
							)}
						</>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-dim)]">
					<div className="flex gap-3">
						<span>
							<kbd className="px-1 bg-[var(--color-bg-highlight)] rounded border border-[var(--color-border)]">&uarr;&darr;</kbd>{" "}
							navigate
						</span>
						<span>
							<kbd className="px-1 bg-[var(--color-bg-highlight)] rounded border border-[var(--color-border)]">&crarr;</kbd>{" "}
							select
						</span>
						<span>
							<kbd className="px-1 bg-[var(--color-bg-highlight)] rounded border border-[var(--color-border)]">esc</kbd>{" "}
							close
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function ThemeList({
	selectedIndex,
	currentTheme,
	onSelect,
	onBack,
}: {
	readonly selectedIndex: number;
	readonly currentTheme: string;
	readonly onSelect: (name: string) => void;
	readonly onBack: () => void;
}) {
	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--color-bg-highlight)] text-left text-[var(--color-text-dim)]"
			>
				<ArrowLeft className="w-4 h-4" />
				<span className="text-sm">Back to commands</span>
			</button>

			<div className="px-3 py-1 mt-1">
				<p className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-wider">
					Themes
				</p>
			</div>

			{themeNames.map((name, idx) => {
				const t = themes[name];
				if (!t) return null;
				const isSelected = idx === selectedIndex;
				const isActive = name === currentTheme;
				return (
					<button
						key={name}
						type="button"
						data-selected={isSelected}
						className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
							isSelected
								? "bg-[var(--color-bg-highlight)]"
								: "hover:bg-[var(--color-bg-highlight)]"
						}`}
						onClick={() => onSelect(name)}
					>
						<div
							className="w-4 h-4 rounded-full shrink-0"
							style={{ background: t.gradient }}
						/>
						<span className={`flex-1 text-sm ${isSelected ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
							{t.label}
						</span>
						{isActive && (
							<Check className="w-4 h-4 text-[var(--color-primary)]" />
						)}
					</button>
				);
			})}
		</>
	);
}
