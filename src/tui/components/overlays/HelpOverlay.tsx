import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import { useTheme } from "../../theme/provider.js";

type Keybind = {
	readonly key: string;
	readonly action: string;
};

const keybinds = {
	navigation: [
		{ key: "j/↓", action: "Move down" },
		{ key: "k/↑", action: "Move up" },
		{ key: "g", action: "Go to top" },
		{ key: "G", action: "Go to bottom" },
		{ key: "/", action: "Search" },
		{ key: "⏎", action: "Select" },
	],
	playback: [
		{ key: "space", action: "Play/pause" },
		{ key: "n", action: "Next track" },
		{ key: "l", action: "Like track" },
		{ key: "d", action: "Dislike track" },
		{ key: "s", action: "Sleep track" },
		{ key: "i", action: "Track info" },
	],
	stations: [
		{ key: "c", action: "Create station" },
		{ key: "r", action: "Rename station" },
		{ key: "x", action: "Delete station" },
		{ key: "S", action: "Manage seeds" },
	],
	system: [
		{ key: ":", action: "Command palette" },
		{ key: "ctrl+x t", action: "Theme picker" },
		{ key: "?", action: "This help" },
		{ key: "q", action: "Quit" },
	],
} as const;

type HelpOverlayProps = {
	readonly onClose: () => void;
	readonly isVisible: boolean;
};

// Border characters for round style
const BORDER = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	horizontal: "─",
	vertical: "│",
} as const;

// Layout constants
const KEY_WIDTH = 12;
const ACTION_WIDTH = 16;
const COLUMN_WIDTH = KEY_WIDTH + ACTION_WIDTH;
const GAP = 4;
const CONTENT_WIDTH = COLUMN_WIDTH * 2 + GAP;

export const HelpOverlay: FC<HelpOverlayProps> = ({ onClose, isVisible }) => {
	const theme = useTheme();

	useInput(
		(input, key) => {
			if (key.escape || input === "?" || input === "q") {
				onClose();
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const title = "Keyboard Shortcuts";
	const titleLineWidth = CONTENT_WIDTH - title.length - 3;

	// Pad the shorter category arrays to match lengths for alignment
	const maxRowsTop = Math.max(
		keybinds.navigation.length,
		keybinds.playback.length,
	);
	const maxRowsBottom = Math.max(
		keybinds.stations.length,
		keybinds.system.length,
	);

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			width="100%"
			height="100%"
			position="absolute"
		>
			<Box flexDirection="column">
				{/* Top border with title */}
				<Text>
					{BORDER.topLeft}
					{BORDER.horizontal}{" "}
					<Text bold color="cyan">
						{title}
					</Text>{" "}
					{BORDER.horizontal.repeat(Math.max(0, titleLineWidth))}
					{BORDER.topRight}
				</Text>

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Category headers row 1 */}
				<Text>
					{BORDER.vertical}{" "}
					<Text bold color={theme.colors.text}>
						{"Navigation".padEnd(COLUMN_WIDTH + GAP - 1)}
					</Text>
					<Text bold color={theme.colors.text}>
						{"Playback".padEnd(COLUMN_WIDTH - 1)}
					</Text>
					{BORDER.vertical}
				</Text>

				{/* Underlines row 1 */}
				<Text>
					{BORDER.vertical}{" "}
					<Text color={theme.colors.textMuted}>
						{"─".repeat(KEY_WIDTH + 4).padEnd(COLUMN_WIDTH + GAP - 1)}
					</Text>
					<Text color={theme.colors.textMuted}>
						{"─".repeat(KEY_WIDTH + 4).padEnd(COLUMN_WIDTH - 1)}
					</Text>
					{BORDER.vertical}
				</Text>

				{/* Keybind rows - Navigation & Playback */}
				{Array.from({ length: maxRowsTop }).map((_, i) => {
					const nav = keybinds.navigation[i];
					const play = keybinds.playback[i];
					const rowKey = nav?.key ?? play?.key ?? `top-row-${String(i)}`;
					return (
						<Text key={rowKey}>
							{BORDER.vertical}{" "}
							{nav ? (
								<>
									<Text color={theme.colors.accent}>
										{nav.key.padEnd(KEY_WIDTH)}
									</Text>
									<Text color={theme.colors.text}>
										{nav.action.padEnd(ACTION_WIDTH + GAP - 1)}
									</Text>
								</>
							) : (
								<Text>{" ".repeat(COLUMN_WIDTH + GAP - 1)}</Text>
							)}
							{play ? (
								<>
									<Text color={theme.colors.accent}>
										{play.key.padEnd(KEY_WIDTH)}
									</Text>
									<Text color={theme.colors.text}>
										{play.action.padEnd(ACTION_WIDTH - 1)}
									</Text>
								</>
							) : (
								<Text>{" ".repeat(COLUMN_WIDTH - 1)}</Text>
							)}
							{BORDER.vertical}
						</Text>
					);
				})}

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(CONTENT_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Category headers row 2 */}
				<Text>
					{BORDER.vertical}{" "}
					<Text bold color={theme.colors.text}>
						{"Stations".padEnd(COLUMN_WIDTH + GAP - 1)}
					</Text>
					<Text bold color={theme.colors.text}>
						{"System".padEnd(COLUMN_WIDTH - 1)}
					</Text>
					{BORDER.vertical}
				</Text>

				{/* Underlines row 2 */}
				<Text>
					{BORDER.vertical}{" "}
					<Text color={theme.colors.textMuted}>
						{"─".repeat(KEY_WIDTH + 4).padEnd(COLUMN_WIDTH + GAP - 1)}
					</Text>
					<Text color={theme.colors.textMuted}>
						{"─".repeat(KEY_WIDTH + 4).padEnd(COLUMN_WIDTH - 1)}
					</Text>
					{BORDER.vertical}
				</Text>

				{/* Keybind rows - Stations & System */}
				{Array.from({ length: maxRowsBottom }).map((_, i) => {
					const sta = keybinds.stations[i];
					const sys = keybinds.system[i];
					const rowKey = sta?.key ?? sys?.key ?? `bottom-row-${String(i)}`;
					return (
						<Text key={rowKey}>
							{BORDER.vertical}{" "}
							{sta ? (
								<>
									<Text color={theme.colors.accent}>
										{sta.key.padEnd(KEY_WIDTH)}
									</Text>
									<Text color={theme.colors.text}>
										{sta.action.padEnd(ACTION_WIDTH + GAP - 1)}
									</Text>
								</>
							) : (
								<Text>{" ".repeat(COLUMN_WIDTH + GAP - 1)}</Text>
							)}
							{sys ? (
								<>
									<Text color={theme.colors.accent}>
										{sys.key.padEnd(KEY_WIDTH)}
									</Text>
									<Text color={theme.colors.text}>
										{sys.action.padEnd(ACTION_WIDTH - 1)}
									</Text>
								</>
							) : (
								<Text>{" ".repeat(COLUMN_WIDTH - 1)}</Text>
							)}
							{BORDER.vertical}
						</Text>
					);
				})}

				{/* Bottom border */}
				<Text>
					{BORDER.bottomLeft}
					{BORDER.horizontal.repeat(CONTENT_WIDTH)}
					{BORDER.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};

export type { HelpOverlayProps };
