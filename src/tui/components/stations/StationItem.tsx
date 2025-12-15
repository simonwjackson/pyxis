import { Box, Text } from "ink";
import type { FC } from "react";
import { useTheme } from "../../theme/index.js";
import { icons } from "../../utils/icons.js";

type StationItemProps = {
	readonly name: string;
	readonly isSelected: boolean;
	readonly isPlaying: boolean;
	readonly isQuickMix?: boolean;
};

/**
 * Renders a single station row in the station list.
 *
 * Selected and playing:
 * ```
 * › ♫ Pink Floyd Radio                                          playing
 * ```
 *
 * Not selected:
 * ```
 *     Radiohead Radio
 * ```
 *
 * QuickMix station:
 * ```
 *   [Q] Shuffle (QuickMix)
 * ```
 */
export const StationItem: FC<StationItemProps> = ({
	name,
	isSelected,
	isPlaying,
	isQuickMix = false,
}) => {
	const theme = useTheme();

	// Build prefix: selection arrow + playing icon
	const selectionPrefix = isSelected ? `${icons.arrow} ` : "  ";
	const playingIcon = isPlaying ? `${icons.playing} ` : "  ";
	const quickMixIndicator = isQuickMix ? "[Q] " : "";

	// Determine text color based on state
	const textColor = isSelected
		? theme.colors.primary
		: isPlaying
			? theme.colors.playing
			: theme.colors.text;

	return (
		<Box>
			{/* Selection arrow */}
			{isSelected ? (
				<Text color={theme.colors.primary}>{selectionPrefix}</Text>
			) : (
				<Text>{selectionPrefix}</Text>
			)}

			{/* Playing icon */}
			{isPlaying ? (
				<Text color={theme.colors.playing}>{playingIcon}</Text>
			) : (
				<Text>{playingIcon}</Text>
			)}

			{/* QuickMix indicator */}
			{isQuickMix && (
				<Text color={theme.colors.accent}>{quickMixIndicator}</Text>
			)}

			{/* Station name */}
			<Text color={textColor} bold={isSelected}>
				{name}
			</Text>

			{/* Spacer */}
			<Box flexGrow={1} />

			{/* Playing badge */}
			{isPlaying && (
				<Text color={theme.colors.playing} dimColor>
					playing
				</Text>
			)}
		</Box>
	);
};
