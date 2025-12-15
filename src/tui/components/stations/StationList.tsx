import { Box, Text } from "ink";
import type { FC } from "react";
import { useMemo } from "react";
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
}) => {
	const theme = useTheme();

	// Calculate scroll offset for virtual scrolling
	const scrollOffset = useMemo(() => {
		const totalStations = stations.length;

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
	}, [stations.length, selectedIndex, maxVisible]);

	// Get visible stations slice
	const visibleStations = useMemo(() => {
		return stations.slice(scrollOffset, scrollOffset + maxVisible);
	}, [stations, scrollOffset, maxVisible]);

	// Build footer text
	const stationCount = stations.length;
	const footerText = `${stationCount} station${stationCount !== 1 ? "s" : ""} · sorted by recent`;

	// Show scroll indicators if needed
	const showScrollUp = scrollOffset > 0;
	const showScrollDown = scrollOffset + maxVisible < stations.length;

	return (
		<Box flexDirection="column" flexGrow={1}>
			{/* Scroll up indicator */}
			{showScrollUp && (
				<Box justifyContent="center">
					<Text color={theme.colors.textMuted}>▲ more</Text>
				</Box>
			)}

			{/* Station items */}
			{visibleStations.map((station, index) => {
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
			})}

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
