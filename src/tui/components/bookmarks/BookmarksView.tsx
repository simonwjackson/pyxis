import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { type FC, useCallback, useEffect, useState } from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/provider.js";
import { getSession } from "../../../cli/cache/session.js";
import {
	getBookmarks,
	deleteArtistBookmark,
	deleteSongBookmark,
	createStation,
} from "../../../client.js";
import { Panel } from "../layout/index.js";

type ArtistBookmark = {
	readonly bookmarkToken: string;
	readonly artistName: string;
	readonly musicToken: string;
	readonly dateCreated: { readonly time: number };
};

type SongBookmark = {
	readonly bookmarkToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName?: string;
	readonly musicToken: string;
	readonly dateCreated: { readonly time: number };
};

type BookmarkItem =
	| { readonly type: "artist"; readonly data: ArtistBookmark }
	| { readonly type: "song"; readonly data: SongBookmark };

type BookmarksViewProps = {
	readonly isVisible: boolean;
	readonly onClose: () => void;
	readonly onStationCreated?: (stationName: string) => void;
	readonly onNotification?: (
		message: string,
		variant: "success" | "error" | "info",
	) => void;
};

type LoadingState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly items: readonly BookmarkItem[] }
	| { readonly status: "error"; readonly message: string };

/**
 * Bookmarks View - Browse and manage saved artists and songs
 *
 * Layout:
 * ```
 * Bookmarks
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  Artists                                                                  │
 * │  > Pink Floyd                                                             │
 * │    Radiohead                                                              │
 * │                                                                           │
 * │  Songs                                                                    │
 * │    Comfortably Numb · Pink Floyd                                          │
 * │    Paranoid Android · Radiohead                                           │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Features:
 * - j/k navigation
 * - Enter to create station from bookmark
 * - x to delete bookmark
 * - Esc to go back
 */
export const BookmarksView: FC<BookmarksViewProps> = ({
	isVisible,
	onClose,
	onStationCreated,
	onNotification,
}) => {
	const theme = useTheme();
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Fetch bookmarks when view becomes visible
	useEffect(() => {
		if (!isVisible) {
			return;
		}

		const fetchBookmarks = async () => {
			setLoadingState({ status: "loading" });

			try {
				const session = await getSession();
				if (!session) {
					setLoadingState({ status: "error", message: "Not logged in" });
					return;
				}

				const result = await Effect.runPromise(
					getBookmarks(session).pipe(Effect.either),
				);

				if (result._tag === "Right") {
					const items: BookmarkItem[] = [];

					// Add artists first
					if (result.right.artists) {
						for (const artist of result.right.artists) {
							items.push({ type: "artist", data: artist });
						}
					}

					// Then songs
					if (result.right.songs) {
						for (const song of result.right.songs) {
							items.push({ type: "song", data: song });
						}
					}

					setLoadingState({ status: "success", items });
					setSelectedIndex(0);
				} else {
					setLoadingState({
						status: "error",
						message: "Failed to load bookmarks",
					});
				}
			} catch {
				setLoadingState({ status: "error", message: "An error occurred" });
			}
		};

		fetchBookmarks();
	}, [isVisible]);

	// Create station from selected bookmark
	const handleCreateStation = useCallback(async () => {
		if (loadingState.status !== "success") return;

		const item = loadingState.items[selectedIndex];
		if (!item) return;

		const name =
			item.type === "artist" ? item.data.artistName : item.data.songName;
		onNotification?.(`Creating station from ${name}...`, "info");

		try {
			const session = await getSession();
			if (!session) {
				onNotification?.("Not logged in", "error");
				return;
			}

			const result = await Effect.runPromise(
				createStation(session, {
					musicToken: item.data.musicToken,
					musicType: item.type === "artist" ? "artist" : "song",
				}).pipe(Effect.either),
			);

			if (result._tag === "Right") {
				onNotification?.(
					`Created station "${result.right.stationName}"`,
					"success",
				);
				onStationCreated?.(result.right.stationName);
				onClose();
			} else {
				onNotification?.("Failed to create station", "error");
			}
		} catch {
			onNotification?.("An error occurred", "error");
		}
	}, [loadingState, selectedIndex, onNotification, onStationCreated, onClose]);

	// Delete selected bookmark
	const handleDelete = useCallback(async () => {
		if (loadingState.status !== "success") return;

		const item = loadingState.items[selectedIndex];
		if (!item) return;

		const name =
			item.type === "artist" ? item.data.artistName : item.data.songName;

		try {
			const session = await getSession();
			if (!session) {
				onNotification?.("Not logged in", "error");
				return;
			}

			const deleteOp =
				item.type === "artist"
					? deleteArtistBookmark(session, {
							bookmarkToken: item.data.bookmarkToken,
						})
					: deleteSongBookmark(session, {
							bookmarkToken: item.data.bookmarkToken,
						});

			const result = await Effect.runPromise(deleteOp.pipe(Effect.either));

			if (result._tag === "Right") {
				// Remove from local state
				const newItems = loadingState.items.filter(
					(_, i) => i !== selectedIndex,
				);
				setLoadingState({ status: "success", items: newItems });

				// Adjust selection
				if (selectedIndex >= newItems.length && newItems.length > 0) {
					setSelectedIndex(newItems.length - 1);
				}

				onNotification?.(`Deleted "${name}"`, "success");
			} else {
				onNotification?.("Failed to delete bookmark", "error");
			}
		} catch {
			onNotification?.("An error occurred", "error");
		}
	}, [loadingState, selectedIndex, onNotification]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			if (key.escape) {
				onClose();
				return;
			}

			if (loadingState.status !== "success") return;

			const maxIndex = loadingState.items.length - 1;

			// Navigation
			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
				return;
			}
			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}
			if (input === "g") {
				setSelectedIndex(0);
				return;
			}
			if (input === "G") {
				setSelectedIndex(maxIndex);
				return;
			}

			// Actions
			if (key.return) {
				handleCreateStation();
				return;
			}
			if (input === "x") {
				handleDelete();
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	// Group items by type for display
	const artistItems =
		loadingState.status === "success"
			? loadingState.items.filter((i) => i.type === "artist")
			: [];
	const songItems =
		loadingState.status === "success"
			? loadingState.items.filter((i) => i.type === "song")
			: [];

	// Calculate global index for selection highlighting
	const getGlobalIndex = (
		type: "artist" | "song",
		localIndex: number,
	): number => {
		if (type === "artist") return localIndex;
		return artistItems.length + localIndex;
	};

	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			<Panel title="Bookmarks" flexGrow={1}>
				<Box flexDirection="column">
					{/* Loading state */}
					{loadingState.status === "loading" && (
						<Box>
							<Spinner label="Loading bookmarks..." />
						</Box>
					)}

					{/* Error state */}
					{loadingState.status === "error" && (
						<Text color={theme.colors.error}>{loadingState.message}</Text>
					)}

					{/* Empty state */}
					{loadingState.status === "success" &&
						loadingState.items.length === 0 && (
							<Text color={theme.colors.textMuted}>
								No bookmarks yet. Like tracks to add bookmarks.
							</Text>
						)}

					{/* Success state with items */}
					{loadingState.status === "success" &&
						loadingState.items.length > 0 && (
							<>
								{/* Artists section */}
								{artistItems.length > 0 && (
									<Box flexDirection="column" marginBottom={1}>
										<Text color={theme.colors.accent} bold>
											Artists
										</Text>
										{artistItems.map((item, idx) => {
											const globalIdx = getGlobalIndex("artist", idx);
											const isSelected = globalIdx === selectedIndex;
											const artist = item.data as ArtistBookmark;
											return (
												<Box key={artist.bookmarkToken}>
													<Text
														color={
															isSelected
																? theme.colors.accent
																: theme.colors.textMuted
														}
													>
														{isSelected ? "> " : "  "}
													</Text>
													<Text
														color={
															isSelected
																? theme.colors.text
																: theme.colors.secondary
														}
														bold={isSelected}
													>
														{truncate(artist.artistName, 60)}
													</Text>
												</Box>
											);
										})}
									</Box>
								)}

								{/* Songs section */}
								{songItems.length > 0 && (
									<Box flexDirection="column">
										<Text color={theme.colors.accent} bold>
											Songs
										</Text>
										{songItems.map((item, idx) => {
											const globalIdx = getGlobalIndex("song", idx);
											const isSelected = globalIdx === selectedIndex;
											const song = item.data as SongBookmark;
											return (
												<Box key={song.bookmarkToken}>
													<Text
														color={
															isSelected
																? theme.colors.accent
																: theme.colors.textMuted
														}
													>
														{isSelected ? "> " : "  "}
													</Text>
													<Text
														color={
															isSelected
																? theme.colors.text
																: theme.colors.secondary
														}
														bold={isSelected}
													>
														{truncate(song.songName, 40)}
													</Text>
													<Text color={theme.colors.textMuted}>
														{" · "}
														{truncate(song.artistName, 30)}
													</Text>
												</Box>
											);
										})}
									</Box>
								)}
							</>
						)}
				</Box>
			</Panel>
		</Box>
	);
};

export type { BookmarksViewProps };
