import { Box, Text, useInput } from "ink";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";

import { useTheme } from "../../theme/index.js";
import { Panel } from "../layout/index.js";

type Station = {
	readonly stationId: string;
	readonly stationName: string;
	readonly isQuickMix?: boolean;
};

type QuickMixManagerViewProps = {
	readonly isVisible: boolean;
	readonly onClose: () => void;
	readonly stations: readonly Station[];
	readonly onSave: (selectedStationIds: readonly string[]) => void;
	readonly onNotification?: (
		message: string,
		variant: "success" | "error" | "info",
	) => void;
	readonly initialSelectedIds?: readonly string[];
};

/**
 * QuickMixManagerView - Manage which stations are included in QuickMix/Shuffle
 *
 * Layout:
 * ```
 * QuickMix Manager
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  Select stations to include in Shuffle:                                  │
 * │                                                                          │
 * │  [x] Rock Radio                                                         │
 * │  [x] Jazz Vibes                                                         │
 * │  > [ ] Classical                                                        │
 * │  [ ] Hip Hop Hits                                                       │
 * │                                                                          │
 * │  3 of 4 stations selected                                               │
 * │  Press 's' to save, Escape to cancel                                    │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Keybinds:
 * - j/k or arrows: Navigate list
 * - Space or Enter: Toggle selection
 * - g/G: Jump to first/last
 * - s: Save and close
 * - Escape: Close without saving
 * - a: Select all
 * - n: Select none
 */
export const QuickMixManagerView: FC<QuickMixManagerViewProps> = ({
	isVisible,
	onClose,
	stations,
	onSave,
	onNotification,
	initialSelectedIds = [],
}) => {
	const theme = useTheme();
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
		new Set(initialSelectedIds),
	);
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Filter out the QuickMix/Shuffle station itself
	const selectableStations = useMemo(
		() => stations.filter((s) => !s.isQuickMix),
		[stations],
	);

	// Reset state when visibility changes or initialSelectedIds changes
	useEffect(() => {
		if (isVisible) {
			setSelectedIds(new Set(initialSelectedIds));
			setSelectedIndex(0);
		}
	}, [isVisible, initialSelectedIds]);

	// Toggle a station's selection
	const toggleStation = useCallback((stationId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(stationId)) {
				next.delete(stationId);
			} else {
				next.add(stationId);
			}
			return next;
		});
	}, []);

	// Select all stations
	const selectAll = useCallback(() => {
		setSelectedIds(new Set(selectableStations.map((s) => s.stationId)));
	}, [selectableStations]);

	// Deselect all stations
	const selectNone = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Save current selection
	const handleSave = useCallback(() => {
		const selectedArray = Array.from(selectedIds);
		onSave(selectedArray);
		onNotification?.(
			`QuickMix updated with ${selectedArray.length} station${selectedArray.length === 1 ? "" : "s"}`,
			"success",
		);
		onClose();
	}, [selectedIds, onSave, onNotification, onClose]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			// Escape to close without saving
			if (key.escape) {
				onClose();
				return;
			}

			const maxIndex = selectableStations.length - 1;

			// Navigation
			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
				return;
			}
			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			// Jump to first/last
			if (input === "g") {
				setSelectedIndex(0);
				return;
			}
			if (input === "G") {
				setSelectedIndex(Math.max(0, maxIndex));
				return;
			}

			// Toggle selection with Space or Enter
			if (input === " " || key.return) {
				const station = selectableStations[selectedIndex];
				if (station) {
					toggleStation(station.stationId);
				}
				return;
			}

			// Save with 's'
			if (input === "s") {
				handleSave();
				return;
			}

			// Select all with 'a'
			if (input === "a") {
				selectAll();
				return;
			}

			// Select none with 'n'
			if (input === "n") {
				selectNone();
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
			<Panel title="QuickMix Manager" flexGrow={1}>
				<Box flexDirection="column" gap={1}>
					{/* Instructions */}
					<Text color={theme.colors.textMuted}>
						Select stations to include in Shuffle:
					</Text>

					{/* Station list with checkboxes */}
					<Box flexDirection="column">
						{selectableStations.length === 0 ? (
							<Text color={theme.colors.textMuted}>No stations available.</Text>
						) : (
							selectableStations.map((station, idx) => {
								const isSelected = selectedIds.has(station.stationId);
								const isFocused = idx === selectedIndex;

								return (
									<Box key={station.stationId}>
										{/* Cursor indicator */}
										<Text
											color={
												isFocused ? theme.colors.accent : theme.colors.textMuted
											}
										>
											{isFocused ? "> " : "  "}
										</Text>
										{/* Checkbox */}
										<Text
											color={
												isSelected
													? theme.colors.success
													: theme.colors.textMuted
											}
										>
											{isSelected ? "[x] " : "[ ] "}
										</Text>
										{/* Station name */}
										<Text
											color={
												isFocused ? theme.colors.text : theme.colors.secondary
											}
											bold={isFocused}
										>
											{truncate(station.stationName, 50)}
										</Text>
									</Box>
								);
							})
						)}
					</Box>

					{/* Footer with count and instructions */}
					<Box flexDirection="column" marginTop={1}>
						<Text color={theme.colors.secondary}>
							{selectedIds.size} of {selectableStations.length} station
							{selectableStations.length === 1 ? "" : "s"} selected
						</Text>
						<Text color={theme.colors.textMuted}>
							Press 's' to save, Escape to cancel
						</Text>
					</Box>
				</Box>
			</Panel>
		</Box>
	);
};

export type { QuickMixManagerViewProps };
