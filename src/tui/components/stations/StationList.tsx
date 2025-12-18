import { Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import type { FC } from "react";
import { useCallback, useMemo } from "react";
import { useTheme } from "../../theme/index.js";
import { StationItem } from "./StationItem.js";

type Station = {
	readonly stationId: string;
	readonly stationName: string;
	readonly isQuickMix?: boolean;
};

type StationListProps = {
	readonly stations: readonly Station[];
	readonly selectedIndex: number;
	readonly playingStationId?: string;
	readonly onSelect?: (station: Station) => void;
	readonly maxVisible?: number;
	readonly filter?: string;
	readonly isFilterActive?: boolean;
	readonly onFilterChange?: (filter: string) => void;
	readonly onFilterClose?: () => void;
};

/**
 * Renders a scrollable station list with virtual scrolling.
 *
 * Features:
 * - Virtual scrolling: only renders maxVisible items
 * - Tracks scroll offset based on selectedIndex
 * - Shows count footer
 */
export const StationList: FC<StationListProps> = ({
	stations,
	selectedIndex,
	playingStationId,
	onSelect: _onSelect,
	maxVisible = 10,
	filter = "",
	isFilterActive = false,
	onFilterChange,
	onFilterClose,
}) => {
	const theme = useTheme();

	// Handle escape to close filter
	useInput(
		(input, key) => {
			if (key.escape && isFilterActive) {
				onFilterClose?.();
			}
		},
		{ isActive: isFilterActive },
	);

	// Filter stations based on filter string
	const filteredStations = useMemo(() => {
		if (!filter.trim()) return stations;
		const lowerFilter = filter.toLowerCase();
		return stations.filter((s) =>
			s.stationName.toLowerCase().includes(lowerFilter),
		);
	}, [stations, filter]);

	// Calculate scroll offset for virtual scrolling
	const scrollOffset = useMemo(() => {
		const totalStations = filteredStations.length;

		// If all stations fit, no scrolling needed
		if (totalStations <= maxVisible) {
			return 0;
		}

		// Keep selected item visible with some padding
		const padding = Math.floor(maxVisible / 3);
		let offset = selectedIndex - padding;

		// Clamp offset to valid range
		offset = Math.max(0, offset);
		offset = Math.min(totalStations - maxVisible, offset);

		return offset;
	}, [filteredStations.length, selectedIndex, maxVisible]);

	// Get visible stations slice
	const visibleStations = useMemo(() => {
		return filteredStations.slice(scrollOffset, scrollOffset + maxVisible);
	}, [filteredStations, scrollOffset, maxVisible]);

	// Build footer text
	const totalCount = stations.length;
	const filteredCount = filteredStations.length;
	const isFiltered = filter.trim() !== "";
	const footerText = isFiltered
		? `${filteredCount} of ${totalCount} station${totalCount !== 1 ? "s" : ""} · filtered`
		: `${totalCount} station${totalCount !== 1 ? "s" : ""} · sorted by recent`;

	// Show scroll indicators if needed
	const showScrollUp = scrollOffset > 0;
	const showScrollDown = scrollOffset + maxVisible < filteredStations.length;

	// Handle filter input change
	const handleFilterChange = useCallback(
		(value: string) => {
			onFilterChange?.(value);
		},
		[onFilterChange],
	);

	return (
		<Box flexDirection="column" flexGrow={1}>
			{/* Filter input */}
			{isFilterActive && (
				<Box marginBottom={1}>
					<Text color={theme.colors.accent}>Filter: </Text>
					<TextInput
						defaultValue={filter}
						onChange={handleFilterChange}
						placeholder="Type to filter stations..."
					/>
				</Box>
			)}

			{/* Show filter indicator when filter is active but input is not focused */}
			{!isFilterActive && filter.trim() !== "" && (
				<Box marginBottom={1}>
					<Text color={theme.colors.textMuted}>
						Filter: <Text color={theme.colors.accent}>{filter}</Text>
						<Text color={theme.colors.textMuted}>
							{" "}
							(f to edit, Esc to clear)
						</Text>
					</Text>
				</Box>
			)}

			{/* Scroll up indicator */}
			{showScrollUp && (
				<Box justifyContent="center">
					<Text color={theme.colors.textMuted}>▲ more</Text>
				</Box>
			)}

			{/* Station items */}
			{visibleStations.length > 0 ? (
				visibleStations.map((station, index) => {
					const actualIndex = scrollOffset + index;
					return (
						<StationItem
							key={station.stationId}
							name={station.stationName}
							isSelected={actualIndex === selectedIndex}
							isPlaying={station.stationId === playingStationId}
							isQuickMix={station.isQuickMix ?? false}
						/>
					);
				})
			) : (
				<Box paddingY={1}>
					<Text color={theme.colors.textMuted}>
						No stations match "{filter}"
					</Text>
				</Box>
			)}

			{/* Scroll down indicator */}
			{showScrollDown && (
				<Box justifyContent="center">
					<Text color={theme.colors.textMuted}>▼ more</Text>
				</Box>
			)}

			{/* Footer count */}
			<Box marginTop={1}>
				<Text color={theme.colors.textMuted}>{footerText}</Text>
			</Box>
		</Box>
	);
};
