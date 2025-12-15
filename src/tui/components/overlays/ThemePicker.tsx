import { Box, Text, useInput } from "ink";
import { type FC, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { loadTheme } from "../../theme/loader.js";
import { Panel } from "../layout/index.js";

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

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			position="absolute"
			marginTop={2}
			marginLeft={10}
		>
			<Panel title="Select Theme" width={46}>
				<Box flexDirection="column" paddingY={1}>
					{themes.map((themeInfo, index) => {
						const isSelected = index === selectedIndex;
						const isCurrent = themeInfo.name === currentTheme;
						const themeColors = loadTheme(themeInfo.name).colors;

						return (
							<Box key={themeInfo.name} gap={1}>
								<Text
									color={isSelected ? theme.colors.primary : theme.colors.text}
								>
									{isSelected ? "›" : " "}
								</Text>
								<Text
									color={themeColors.primary}
									dimColor={!isSelected && !isCurrent}
								>
									●
								</Text>
								<Box width={14}>
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
										{themeInfo.name}
									</Text>
								</Box>
								<Text
									color={
										isSelected ? theme.colors.textMuted : theme.colors.textDim
									}
								>
									{themeInfo.description}
								</Text>
							</Box>
						);
					})}
				</Box>
			</Panel>
		</Box>
	);
};
