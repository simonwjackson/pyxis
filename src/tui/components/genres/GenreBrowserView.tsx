import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { type FC, useCallback, useEffect, useState } from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/provider.js";
import { getSession } from "../../../cli/cache/session.js";
import { getGenreStations, createStation } from "../../../client.js";
import { Panel } from "../layout/index.js";
import type { GenreCategory, GenreStation } from "../../../types/api.js";

type GenreBrowserViewProps = {
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
	| {
			readonly status: "success";
			readonly categories: readonly GenreCategory[];
	  }
	| { readonly status: "error"; readonly message: string };

type SelectionMode = "category" | "station";

/**
 * Genre Browser View - Browse and create stations from genre categories
 *
 * Layout:
 * ```
 * Genres
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  > Rock                                                                   │
 * │    Pop                                                                    │
 * │    Jazz                                                                   │
 * │    Classical                                                              │
 * │                                                                           │
 * │  ─────────────────────────────────────────────────────────────────────── │
 * │                                                                           │
 * │  Rock Stations:                                                           │
 * │  > Classic Rock Radio                                                     │
 * │    Alternative Rock Radio                                                 │
 * │    Hard Rock Radio                                                        │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Features:
 * - j/k navigation within category or station list
 * - Tab to switch between categories and stations
 * - Enter to create station from selected genre station
 * - Esc to go back
 */
export const GenreBrowserView: FC<GenreBrowserViewProps> = ({
	isVisible,
	onClose,
	onStationCreated,
	onNotification,
}) => {
	const theme = useTheme();
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});
	const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
	const [selectedStationIndex, setSelectedStationIndex] = useState(0);
	const [selectionMode, setSelectionMode] = useState<SelectionMode>("category");

	// Fetch genre stations when view becomes visible
	useEffect(() => {
		if (!isVisible) {
			return;
		}

		const fetchGenres = async () => {
			setLoadingState({ status: "loading" });

			try {
				const session = await getSession();
				if (!session) {
					setLoadingState({ status: "error", message: "Not logged in" });
					return;
				}

				const result = await Effect.runPromise(
					getGenreStations(session).pipe(Effect.either),
				);

				if (result._tag === "Right") {
					setLoadingState({
						status: "success",
						categories: result.right.categories,
					});
					setSelectedCategoryIndex(0);
					setSelectedStationIndex(0);
					setSelectionMode("category");
				} else {
					setLoadingState({
						status: "error",
						message: "Failed to load genre stations",
					});
				}
			} catch {
				setLoadingState({ status: "error", message: "An error occurred" });
			}
		};

		fetchGenres();
	}, [isVisible]);

	// Get current category and its stations
	const currentCategory =
		loadingState.status === "success"
			? loadingState.categories[selectedCategoryIndex]
			: null;

	const currentStations = currentCategory?.stations ?? [];

	// Create station from selected genre station
	const handleCreateStation = useCallback(async () => {
		if (loadingState.status !== "success" || selectionMode !== "station")
			return;

		const station = currentStations[selectedStationIndex];
		if (!station) return;

		onNotification?.(`Creating station "${station.stationName}"...`, "info");

		try {
			const session = await getSession();
			if (!session) {
				onNotification?.("Not logged in", "error");
				return;
			}

			const result = await Effect.runPromise(
				createStation(session, {
					musicToken: station.stationToken,
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
	}, [
		loadingState,
		selectionMode,
		currentStations,
		selectedStationIndex,
		onNotification,
		onStationCreated,
		onClose,
	]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			if (key.escape) {
				onClose();
				return;
			}

			if (loadingState.status !== "success") return;

			const maxCategoryIndex = loadingState.categories.length - 1;
			const maxStationIndex = currentStations.length - 1;

			// Tab to switch focus between categories and stations
			if (key.tab) {
				if (selectionMode === "category" && currentStations.length > 0) {
					setSelectionMode("station");
					setSelectedStationIndex(0);
				} else {
					setSelectionMode("category");
				}
				return;
			}

			// Navigation
			if (input === "j" || key.downArrow) {
				if (selectionMode === "category") {
					setSelectedCategoryIndex((prev) =>
						Math.min(prev + 1, maxCategoryIndex),
					);
					setSelectedStationIndex(0); // Reset station selection when changing category
				} else {
					setSelectedStationIndex((prev) =>
						Math.min(prev + 1, maxStationIndex),
					);
				}
				return;
			}
			if (input === "k" || key.upArrow) {
				if (selectionMode === "category") {
					setSelectedCategoryIndex((prev) => Math.max(prev - 1, 0));
					setSelectedStationIndex(0);
				} else {
					setSelectedStationIndex((prev) => Math.max(prev - 1, 0));
				}
				return;
			}
			if (input === "g") {
				if (selectionMode === "category") {
					setSelectedCategoryIndex(0);
				} else {
					setSelectedStationIndex(0);
				}
				return;
			}
			if (input === "G") {
				if (selectionMode === "category") {
					setSelectedCategoryIndex(maxCategoryIndex);
				} else {
					setSelectedStationIndex(maxStationIndex);
				}
				return;
			}

			// Enter to create station (only when station is selected)
			if (key.return) {
				if (selectionMode === "station") {
					handleCreateStation();
				} else if (currentStations.length > 0) {
					// Switch to station mode if in category mode
					setSelectionMode("station");
					setSelectedStationIndex(0);
				}
				return;
			}

			// Left/right or h/l to switch panels
			if (input === "h" || key.leftArrow) {
				setSelectionMode("category");
				return;
			}
			if (input === "l" || key.rightArrow) {
				if (currentStations.length > 0) {
					setSelectionMode("station");
				}
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			<Panel title="Genre Stations" flexGrow={1}>
				<Box flexDirection="column">
					{/* Loading state */}
					{loadingState.status === "loading" && (
						<Box>
							<Spinner label="Loading genre stations..." />
						</Box>
					)}

					{/* Error state */}
					{loadingState.status === "error" && (
						<Text color={theme.colors.error}>{loadingState.message}</Text>
					)}

					{/* Empty state */}
					{loadingState.status === "success" &&
						loadingState.categories.length === 0 && (
							<Text color={theme.colors.textMuted}>
								No genre stations available.
							</Text>
						)}

					{/* Success state with items */}
					{loadingState.status === "success" &&
						loadingState.categories.length > 0 && (
							<Box flexDirection="row" gap={2}>
								{/* Categories column */}
								<Box flexDirection="column" width="40%">
									<Text color={theme.colors.accent} bold>
										Categories
									</Text>
									<Box flexDirection="column" marginTop={1}>
										{loadingState.categories.map((category, idx) => {
											const isSelected =
												idx === selectedCategoryIndex &&
												selectionMode === "category";
											const isActive = idx === selectedCategoryIndex;
											return (
												<Box key={category.categoryName}>
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
															isActive
																? theme.colors.text
																: theme.colors.secondary
														}
														bold={isActive}
													>
														{truncate(category.categoryName, 25)}
													</Text>
													<Text color={theme.colors.textMuted}>
														{" "}
														({category.stations.length})
													</Text>
												</Box>
											);
										})}
									</Box>
								</Box>

								{/* Stations column */}
								<Box flexDirection="column" flexGrow={1}>
									<Text color={theme.colors.accent} bold>
										{currentCategory?.categoryName ?? "Stations"}
									</Text>
									<Box flexDirection="column" marginTop={1}>
										{currentStations.length === 0 ? (
											<Text color={theme.colors.textMuted}>
												No stations in this category.
											</Text>
										) : (
											currentStations.map(
												(station: GenreStation, idx: number) => {
													const isSelected =
														idx === selectedStationIndex &&
														selectionMode === "station";
													return (
														<Box key={station.stationId}>
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
																{truncate(station.stationName, 40)}
															</Text>
														</Box>
													);
												},
											)
										)}
									</Box>
								</Box>
							</Box>
						)}
				</Box>
			</Panel>
		</Box>
	);
};

export type { GenreBrowserViewProps };
