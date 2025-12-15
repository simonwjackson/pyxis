import { Box, Text } from "ink";
import type { FC } from "react";
import { useTheme } from "../../theme/provider.js";
import { formatDuration } from "../../utils/format.js";

type TrackProgressProps = {
	readonly current: number; // seconds elapsed
	readonly total: number; // total track length in seconds
	readonly width?: number; // bar width in characters (default: 50)
	readonly showTime?: boolean; // show time labels (default: true)
};

/**
 * Visual progress bar for track playback.
 *
 * Renders:
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○─────────  3:42 / 6:23
 * ```
 */
export const TrackProgress: FC<TrackProgressProps> = ({
	current,
	total,
	width = 50,
	showTime = true,
}) => {
	const theme = useTheme();

	// Calculate fill percentage
	const percentage = total > 0 ? Math.min(current / total, 1) : 0;

	// Calculate filled characters count
	const filledCount = Math.round(percentage * width);

	// Build the progress bar parts
	// Filled portion uses ━ (U+2501)
	// Scrubber uses ○ (U+25CB)
	// Unfilled portion uses ─ (U+2500)
	const filledPart = "━".repeat(Math.max(0, filledCount - 1));
	const unfilledPart = "─".repeat(Math.max(0, width - filledCount));

	// Format time labels
	const currentTime = formatDuration(current);
	const totalTime = formatDuration(total);

	return (
		<Box flexDirection="row">
			<Text color={theme.colors.progress}>{filledPart}</Text>
			<Text color={theme.colors.primary}>○</Text>
			<Text color={theme.colors.progressTrack}>{unfilledPart}</Text>
			{showTime && (
				<Text color={theme.colors.textMuted}>
					{"  "}
					{currentTime} / {totalTime}
				</Text>
			)}
		</Box>
	);
};
