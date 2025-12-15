import type { FC } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/provider.js";
import { truncate } from "../../utils/index.js";
import { Panel } from "../layout/index.js";

type Track = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
};

type QueueListProps = {
	readonly tracks: readonly Track[];
	readonly maxVisible?: number;
	readonly title?: string;
	readonly width?: number;
};

/**
 * Shows upcoming tracks in the queue
 *
 * ```
 * ╭─ Up Next ──────────────────────────────────────────────────────────────╮
 * │  1. Wish You Were Here · Pink Floyd                                    │
 * │  2. Paranoid Android · Radiohead                                       │
 * │  3. Time · Pink Floyd                                                  │
 * │  4. Karma Police · Radiohead                                           │
 * ╰────────────────────────────────────────────────────────────────────────╯
 * ```
 */
export const QueueList: FC<QueueListProps> = ({
	tracks,
	maxVisible = 4,
	title = "Up Next",
	width,
}) => {
	const theme = useTheme();

	// Empty queue state
	if (tracks.length === 0) {
		return (
			<Panel title={title} {...(width !== undefined && { width })}>
				<Box justifyContent="center" paddingY={1}>
					<Text dimColor>Queue empty</Text>
				</Box>
			</Panel>
		);
	}

	const visibleTracks = tracks.slice(0, maxVisible);
	const remainingCount = tracks.length - maxVisible;

	// Calculate available width for track info
	// Account for panel borders, padding, number prefix (e.g. "1. "), separator
	const availableWidth = (width ?? 80) - 10; // borders + padding + number prefix

	return (
		<Panel title={title} {...(width !== undefined && { width })}>
			{visibleTracks.map((track, index) => {
				const number = index + 1;
				// Build display string to calculate truncation
				const fullText = `${track.songName} · ${track.artistName}`;
				const displayText = truncate(fullText, availableWidth);

				// Find where to split for coloring (if truncated, we need to handle it)
				const separator = " · ";
				const separatorIndex = displayText.indexOf(separator);

				// If separator is still visible, split for coloring
				if (separatorIndex !== -1 && separatorIndex < displayText.length - 3) {
					const songPart = displayText.slice(0, separatorIndex);
					const artistPart = displayText.slice(
						separatorIndex + separator.length,
					);

					return (
						<Box key={track.trackToken}>
							<Text color={theme.colors.textMuted}>{number}. </Text>
							<Text color={theme.colors.text}>{songPart}</Text>
							<Text color={theme.colors.textDim}>{separator}</Text>
							<Text color={theme.colors.textMuted}>{artistPart}</Text>
						</Box>
					);
				}

				// If truncated before separator, just show as song name
				return (
					<Box key={track.trackToken}>
						<Text color={theme.colors.textMuted}>{number}. </Text>
						<Text color={theme.colors.text}>{displayText}</Text>
					</Box>
				);
			})}

			{/* Show remaining count if there are more tracks */}
			{remainingCount > 0 && (
				<Box marginTop={1}>
					<Text color={theme.colors.textDim}>+{remainingCount} more</Text>
				</Box>
			)}
		</Panel>
	);
};
