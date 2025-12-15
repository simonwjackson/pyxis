import { Box, Text, useInput } from "ink";
import { type FC, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { loadTheme } from "../../theme/loader.js";

interface ThemeInfo {
	readonly name: string;
	readonly description: string;
}

const themes: readonly ThemeInfo[] = [
	{ name: "pyxis", description: "Music-focused pink" },
	{ name: "tokyonight", description: "Popular dark blue" },
	{ name: "catppuccin", description: "Soothing pastels" },
	{ name: "nord", description: "Arctic cool" },
	{ name: "gruvbox", description: "Retro warm" },
	{ name: "dracula", description: "Dark gothic" },
	{ name: "rose-pine", description: "Elegant dark" },
	{ name: "system", description: "Match terminal" },
];

interface ThemePickerProps {
	readonly currentTheme: string;
	readonly onSelect: (themeName: string) => void;
	readonly onClose: () => void;
	readonly isVisible: boolean;
}

export const ThemePicker: FC<ThemePickerProps> = ({
	currentTheme,
	onSelect,
	onClose,
	isVisible,
}) => {
	const theme = useTheme();
	const currentIndex = themes.findIndex((t) => t.name === currentTheme);
	const [selectedIndex, setSelectedIndex] = useState(
		currentIndex >= 0 ? currentIndex : 0,
	);

	useInput(
		(input, key) => {
			if (key.escape) {
				onClose();
				return;
			}

			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, themes.length - 1));
				return;
			}

			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			if (key.return) {
				const selected = themes[selectedIndex];
				if (selected) {
					onSelect(selected.name);
				}
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	// Border characters
	const BORDER = {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	} as const;

	const title = "Select Theme";
	const contentWidth = 44;
	const titleLineWidth = contentWidth - title.length - 3;

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			position="absolute"
			marginTop={2}
			marginLeft={10}
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
					{" ".repeat(contentWidth)}
					{BORDER.vertical}
				</Text>

				{/* Theme list */}
				{themes.map((themeInfo, index) => {
					const isSelected = index === selectedIndex;
					const isCurrent = themeInfo.name === currentTheme;
					const themeColors = loadTheme(themeInfo.name).colors;

					return (
						<Text key={themeInfo.name}>
							{BORDER.vertical}{" "}
							<Text
								color={isSelected ? theme.colors.primary : theme.colors.text}
							>
								{isSelected ? "›" : " "}
							</Text>{" "}
							<Text
								color={themeColors.primary}
								dimColor={!isSelected && !isCurrent}
							>
								●
							</Text>{" "}
							<Text
								color={
									isCurrent
										? theme.colors.accent
										: isSelected
											? theme.colors.text
											: theme.colors.textMuted
								}
								bold={isCurrent}
							>
								{themeInfo.name.padEnd(14)}
							</Text>
							<Text
								color={
									isSelected ? theme.colors.textMuted : theme.colors.textDim
								}
							>
								{themeInfo.description.padEnd(22)}
							</Text>
							{BORDER.vertical}
						</Text>
					);
				})}

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(contentWidth)}
					{BORDER.vertical}
				</Text>

				{/* Bottom border */}
				<Text>
					{BORDER.bottomLeft}
					{BORDER.horizontal.repeat(contentWidth)}
					{BORDER.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};
