import { Box, Text, useInput } from "ink";
import { useMemo } from "react";
import type { FC } from "react";

import { useTheme } from "../../theme/index.js";
import { formatDuration, truncate } from "../../utils/index.js";
import { icons } from "../../utils/icons.js";
import { Panel } from "../layout/index.js";

type Track = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumYear?: number;
	readonly duration?: number;
};

type Station = {
	readonly stationId: string;
	readonly stationName: string;
	readonly seeds?: readonly string[];
};

type NowPlayingViewProps = {
	readonly track: Track | null;
	readonly station: Station | null;
	readonly queue: readonly Track[];
	readonly position: number;
	readonly isPlaying: boolean;
	readonly onLike?: () => void;
	readonly onDislike?: () => void;
	readonly onSleep?: () => void;
	readonly onNext?: () => void;
	readonly onPrev?: () => void;
	readonly onTogglePlay?: () => void;
};

/**
 * Full-screen Now Playing view with track info, progress, controls, and queue.
 *
 * ```
 *                          NOW PLAYING
 *
 *                     Comfortably Numb
 *                     Pink Floyd . The Wall . 1979
 *
 *             ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○─────────────  3:42 / 6:23
 *
 *                       ⏮    ▶    ⏭
 *
 *                  ♥ Like    ✗ Dislike    💤 Sleep
 *
 *  ┌─ Up Next ──────────────────────────────────────────────────────────────┐
 *  │  1. Wish You Were Here · Pink Floyd                                    │
 *  │  2. Paranoid Android · Radiohead                                       │
 *  │  3. Time · Pink Floyd                                                  │
 *  │  4. Karma Police · Radiohead                                           │
 *  └────────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ Pink Floyd Radio ─────────────────────────────────────────────────────┐
 *  │  Based on: Pink Floyd (artist) · Psychedelic Rock (genre)              │
 *  └────────────────────────────────────────────────────────────────────────┘
 * ```
 */
export const NowPlayingView: FC<NowPlayingViewProps> = ({
	track,
	station,
	queue,
	position,
	isPlaying,
	onLike,
	onDislike,
	onSleep,
	onNext,
	onPrev: _onPrev,
	onTogglePlay,
}) => {
	const theme = useTheme();

	// Keyboard input handling
	useInput(
		(input, key) => {
			// Like with +
			if (input === "+") {
				onLike?.();
				return;
			}
			// Dislike with -
			if (input === "-") {
				onDislike?.();
				return;
			}
			// Sleep with z
			if (input === "z") {
				onSleep?.();
				return;
			}
			// Next with n or right arrow
			if (input === "n" || key.rightArrow) {
				onNext?.();
				return;
			}
			// Play/pause with space
			if (input === " ") {
				onTogglePlay?.();
				return;
			}
		},
		{ isActive: true },
	);

	// Calculate progress bar
	const progressBar = useMemo(() => {
		if (!track?.duration || track.duration === 0) {
			return { bar: "─".repeat(40), timeDisplay: "0:00 / 0:00" };
		}

		const duration = track.duration;
		const progress = Math.min(position / duration, 1);
		const barWidth = 40;
		const filledWidth = Math.floor(progress * barWidth);
		const emptyWidth = barWidth - filledWidth - 1;

		const filled = "━".repeat(Math.max(0, filledWidth));
		const knob = "○";
		const empty = "─".repeat(Math.max(0, emptyWidth));

		const bar = `${filled}${knob}${empty}`;
		const timeDisplay = `${formatDuration(position)} / ${formatDuration(duration)}`;

		return { bar, timeDisplay };
	}, [track?.duration, position]);

	// Get up to 4 tracks for queue display
	const visibleQueue = useMemo(() => {
		return queue.slice(0, 4);
	}, [queue]);

	// Build album info line
	const albumInfo = useMemo(() => {
		if (!track) return "";
		const parts = [track.artistName, track.albumName];
		if (track.albumYear) {
			parts.push(String(track.albumYear));
		}
		return parts.join(" · ");
	}, [track]);

	// Build station seeds line
	const stationSeeds = useMemo(() => {
		if (!station?.seeds || station.seeds.length === 0) {
			return null;
		}
		return `Based on: ${station.seeds.join(" · ")}`;
	}, [station]);

	// Play/pause icon
	const playPauseIcon = isPlaying ? icons.paused : icons.play;

	if (!track) {
		return (
			<Box
				flexDirection="column"
				alignItems="center"
				justifyContent="center"
				flexGrow={1}
			>
				<Text color={theme.colors.textMuted}>No track playing</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" alignItems="center" flexGrow={1} paddingY={1}>
			{/* Header */}
			<Box marginBottom={2}>
				<Text color={theme.colors.accent} bold>
					{icons.playing} NOW PLAYING
				</Text>
			</Box>

			{/* Track title */}
			<Box marginBottom={1}>
				<Text color={theme.colors.text} bold>
					{truncate(track.songName, 50)}
				</Text>
			</Box>

			{/* Artist · Album · Year */}
			<Box marginBottom={2}>
				<Text color={theme.colors.textMuted}>{truncate(albumInfo, 60)}</Text>
			</Box>

			{/* Progress bar */}
			<Box marginBottom={2}>
				<Text color={theme.colors.progress}>{progressBar.bar}</Text>
				<Text color={theme.colors.textMuted}> {progressBar.timeDisplay}</Text>
			</Box>

			{/* Playback controls */}
			<Box marginBottom={2} gap={3}>
				<Text color={theme.colors.secondary}>{icons.prev}</Text>
				<Text color={theme.colors.primary}>{playPauseIcon} (space)</Text>
				<Text color={theme.colors.secondary}>{icons.next} (n)</Text>
			</Box>

			{/* Action buttons */}
			<Box marginBottom={3} gap={4}>
				<Text color={theme.colors.liked}>{icons.liked} Like (+)</Text>
				<Text color={theme.colors.disliked}>{icons.disliked} Dislike (-)</Text>
				<Text color={theme.colors.textMuted}>💤 Sleep (z)</Text>
			</Box>

			{/* Up Next panel */}
			{visibleQueue.length > 0 && (
				<Box width="100%" paddingX={2} marginBottom={1}>
					<Panel title="Up Next">
						<Box flexDirection="column">
							{visibleQueue.map((queueTrack, index) => (
								<Box key={queueTrack.trackToken}>
									<Text color={theme.colors.textMuted}>{index + 1}. </Text>
									<Text color={theme.colors.text}>
										{truncate(queueTrack.songName, 40)}
									</Text>
									<Text color={theme.colors.textMuted}>
										{" "}
										· {truncate(queueTrack.artistName, 30)}
									</Text>
								</Box>
							))}
						</Box>
					</Panel>
				</Box>
			)}

			{/* Station info panel */}
			{station && (
				<Box width="100%" paddingX={2}>
					<Panel title={station.stationName}>
						<Box>
							{stationSeeds ? (
								<Text color={theme.colors.textMuted}>{stationSeeds}</Text>
							) : (
								<Text color={theme.colors.textMuted}>
									Personalized radio station
								</Text>
							)}
						</Box>
					</Panel>
				</Box>
			)}
		</Box>
	);
};
