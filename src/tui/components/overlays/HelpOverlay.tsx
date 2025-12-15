import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import { useTheme } from "../../theme/provider.js";
import { Panel } from "../layout/Panel.js";

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
		{ key: "ctrl+p", action: "Command palette" },
		{ key: "ctrl+x t", action: "Theme picker" },
		{ key: "?", action: "This help" },
		{ key: "q", action: "Quit" },
	],
} as const;

type HelpOverlayProps = {
	readonly onClose: () => void;
	readonly isVisible: boolean;
};

type KeybindRowProps = {
	readonly keybind: Keybind;
	readonly keyWidth: number;
};

const KeybindRow: FC<KeybindRowProps> = ({ keybind, keyWidth }) => {
	const theme = useTheme();

	return (
		<Box flexDirection="row">
			<Text color={theme.colors.textDim}>
				{keybind.key.padEnd(keyWidth, " ")}
			</Text>
			<Text color={theme.colors.text}>{keybind.action}</Text>
		</Box>
	);
};

type CategoryProps = {
	readonly title: string;
	readonly keybinds: readonly Keybind[];
	readonly keyWidth: number;
};

const Category: FC<CategoryProps> = ({ title, keybinds, keyWidth }) => {
	const theme = useTheme();

	return (
		<Box flexDirection="column">
			<Text bold color={theme.colors.text}>
				{title}
			</Text>
			<Text color={theme.colors.borderMuted}>
				{"─".repeat(title.length + 8)}
			</Text>
			{keybinds.map((keybind) => (
				<KeybindRow key={keybind.key} keybind={keybind} keyWidth={keyWidth} />
			))}
		</Box>
	);
};

export const HelpOverlay: FC<HelpOverlayProps> = ({ onClose, isVisible }) => {
	useInput(
		(input, key) => {
			if (key.escape || input === "?") {
				onClose();
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const keyWidth = 12;

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			width="100%"
			height="100%"
		>
			<Panel title="Keyboard Shortcuts">
				<Box flexDirection="column" gap={1}>
					<Box flexDirection="row" gap={4}>
						<Category
							title="Navigation"
							keybinds={keybinds.navigation}
							keyWidth={keyWidth}
						/>
						<Category
							title="Playback"
							keybinds={keybinds.playback}
							keyWidth={keyWidth}
						/>
					</Box>
					<Box flexDirection="row" gap={4}>
						<Category
							title="Stations"
							keybinds={keybinds.stations}
							keyWidth={keyWidth}
						/>
						<Category
							title="System"
							keybinds={keybinds.system}
							keyWidth={keyWidth}
						/>
					</Box>
				</Box>
			</Panel>
		</Box>
	);
};

export type { HelpOverlayProps };
