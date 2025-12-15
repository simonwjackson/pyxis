import { Box, Text } from "ink";
import type { FC } from "react";
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
const PROGRESS_HANDLE = "●";

// Border characters for round style
const BORDER = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	horizontal: "─",
	vertical: "│",
} as const;

/**
 * Compact now-playing bar that sits at the bottom of the stations view
 *
 * ```
 * ╭─ Now Playing ──────────────────────────────────────────────────────────╮
 * │ Comfortably Numb · Pink Floyd · The Wall                            ♥  │
 * │ ○─────────────────────────────────────────────────────  0:00 / 6:23    │
 * ╰────────────────────────────────────────────────────────────────────────╯
 * ```
 */
export const NowPlayingBar: FC<NowPlayingBarProps> = ({
	track,
	position,
	isPlaying: _isPlaying,
	width: _width,
}) => {
	const theme = useTheme();
	const title = "Now Playing";
	// Width of content area (excluding borders)
	const contentWidth = 68;
	// Width of horizontal line after title
	const titleLineWidth = contentWidth - title.length - 3; // -3 for "─ " before and " " after title

	if (!track) {
		return (
			<Box flexDirection="column" marginTop={1}>
				{/* Top border with inline title */}
				<Text>
					{BORDER.topLeft}
					{BORDER.horizontal}{" "}
					<Text bold color="cyan">
						{title}
					</Text>{" "}
					{BORDER.horizontal.repeat(Math.max(0, titleLineWidth))}
					{BORDER.topRight}
				</Text>

				{/* Content */}
				<Text>
					{BORDER.vertical}{" "}
					<Text color={theme.colors.textMuted}>No track playing</Text>
					{" ".repeat(contentWidth - 16)}
					{BORDER.vertical}
				</Text>

				{/* Bottom border */}
				<Text>
					{BORDER.bottomLeft}
					{BORDER.horizontal.repeat(contentWidth)}
					{BORDER.bottomRight}
				</Text>
			</Box>
		);
	}

	const trackLength = track.trackLength ?? 0;
	const currentTime = formatDuration(Math.min(position, trackLength));
	const totalTime = formatDuration(trackLength);
	const timeDisplay = `${currentTime} / ${totalTime}`;

	// Build track info string
	const trackInfo = `${track.songName} · ${track.artistName} · ${track.albumName}`;
	const isLiked = track.rating === 1;

	// Truncate track info if needed
	const heartSpace = isLiked ? 2 : 0;
	const maxTrackInfoWidth = contentWidth - 2 - heartSpace;
	const displayTrackInfo = truncate(trackInfo, maxTrackInfoWidth);
	const trackInfoPadding = maxTrackInfoWidth - displayTrackInfo.length;

	// Progress bar calculation
	const progressBarWidth = contentWidth - timeDisplay.length - 4;
	const progress = trackLength > 0 ? Math.min(position / trackLength, 1) : 0;
	const filledWidth = Math.floor(progress * progressBarWidth);
	const unfilledWidth = Math.max(0, progressBarWidth - filledWidth);

	return (
		<Box flexDirection="column" marginTop={1}>
			{/* Top border with inline title */}
			<Text>
				{BORDER.topLeft}
				{BORDER.horizontal}{" "}
				<Text bold color="cyan">
					{title}
				</Text>{" "}
				{BORDER.horizontal.repeat(Math.max(0, titleLineWidth))}
				{BORDER.topRight}
			</Text>

			{/* Track info line */}
			<Text>
				{BORDER.vertical}{" "}
				<Text color={theme.colors.text}>{displayTrackInfo}</Text>
				{" ".repeat(trackInfoPadding)}
				{isLiked && <Text color={theme.colors.liked}>{theme.icons.liked}</Text>}
				{isLiked ? " " : ""}{" "}
				{BORDER.vertical}
			</Text>

			{/* Progress bar line */}
			<Text>
				{BORDER.vertical}{" "}
				<Text color={theme.colors.progress}>
					{PROGRESS_FILLED.repeat(filledWidth)}
				</Text>
				<Text color={theme.colors.accent}>{PROGRESS_HANDLE}</Text>
				<Text color={theme.colors.progressTrack}>
					{PROGRESS_UNFILLED.repeat(unfilledWidth)}
				</Text>
				<Text color={theme.colors.textMuted}> {timeDisplay}</Text>{" "}
				{BORDER.vertical}
			</Text>

			{/* Bottom border */}
			<Text>
				{BORDER.bottomLeft}
				{BORDER.horizontal.repeat(contentWidth)}
				{BORDER.bottomRight}
			</Text>
		</Box>
	);
};
