import { Box, Text } from "ink";
import type { FC } from "react";
import { Panel } from "../layout/index.js";
import { useTheme } from "../../theme/provider.js";
import { formatDuration, truncate } from "../../utils/index.js";

type Track = {
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly trackLength?: number; // in seconds
	readonly rating?: number; // 0=none, 1=liked
};

type NowPlayingBarProps = {
	readonly track: Track | null;
	readonly position: number; // current position in seconds
	readonly isPlaying: boolean;
	readonly width?: number;
};

const PROGRESS_FILLED = "━";
const PROGRESS_UNFILLED = "─";
const PROGRESS_HANDLE = "○";

/**
 * Compact now-playing bar that sits at the bottom of the stations view
 *
 * ```
 * ╭─ Now Playing ──────────────────────────────────────────────────────────╮
 * │  Comfortably Numb · Pink Floyd · The Wall                   ♥          │
 * │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○─────────  3:42 / 6:23 │
 * ╰────────────────────────────────────────────────────────────────────────╯
 * ```
 */
export const NowPlayingBar: FC<NowPlayingBarProps> = ({
	track,
	position,
	isPlaying: _isPlaying,
	width,
}) => {
	const theme = useTheme();
	const panelWidth = width ?? 80;

	if (!track) {
		return (
			<Panel title="Now Playing" width={panelWidth}>
				<Box justifyContent="center" paddingY={1}>
					<Text color={theme.colors.textMuted}>No track playing</Text>
				</Box>
			</Panel>
		);
	}

	const trackLength = track.trackLength ?? 0;
	const currentTime = formatDuration(Math.min(position, trackLength));
	const totalTime = formatDuration(trackLength);
	const timeDisplay = `${currentTime} / ${totalTime}`;

	// Calculate progress bar width
	// Account for padding, borders, time display, and spacing
	const timeWidth = timeDisplay.length + 2; // +2 for spacing
	const availableWidth = panelWidth - 6; // -6 for panel borders/padding
	const progressBarWidth = Math.max(10, availableWidth - timeWidth);

	// Calculate progress percentage
	const progress = trackLength > 0 ? Math.min(position / trackLength, 1) : 0;
	const filledWidth = Math.floor(progress * (progressBarWidth - 1)); // -1 for handle
	const unfilledWidth = progressBarWidth - filledWidth - 1;

	// Build track info string
	const trackInfo = `${track.songName} · ${track.artistName} · ${track.albumName}`;
	const isLiked = track.rating === 1;

	// Calculate max width for track info (leave room for heart icon)
	const heartSpace = isLiked ? 4 : 0;
	const maxTrackInfoWidth = availableWidth - heartSpace;
	const displayTrackInfo = truncate(trackInfo, maxTrackInfoWidth);

	return (
		<Panel title="Now Playing" width={panelWidth}>
			{/* Track info line */}
			<Box justifyContent="space-between">
				<Text color={theme.colors.text}>{displayTrackInfo}</Text>
				{isLiked && <Text color={theme.colors.liked}>{theme.icons.liked}</Text>}
			</Box>

			{/* Progress bar line */}
			<Box justifyContent="space-between">
				<Box>
					<Text color={theme.colors.progress}>
						{PROGRESS_FILLED.repeat(filledWidth)}
					</Text>
					<Text color={theme.colors.progressTrack}>{PROGRESS_HANDLE}</Text>
					<Text color={theme.colors.progressTrack}>
						{PROGRESS_UNFILLED.repeat(Math.max(0, unfilledWidth))}
					</Text>
				</Box>
				<Text color={theme.colors.textMuted}> {timeDisplay}</Text>
			</Box>
		</Panel>
	);
};
