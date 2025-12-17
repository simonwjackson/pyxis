import { Box, Text, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import { type FC, useState, useEffect } from "react";
import { useTheme } from "../../theme/provider.js";

type RenameStationOverlayProps = {
	readonly stationId: string | null;
	readonly currentName: string;
	readonly onConfirm: (stationId: string, newName: string) => void;
	readonly onCancel: () => void;
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

const DIALOG_WIDTH = 50;
const INNER_WIDTH = DIALOG_WIDTH - 2;

/**
 * Rename Station Overlay - Text input dialog for renaming a station
 *
 * Layout:
 * ```
 * ╭─ Rename Station ─────────────────────────────────╮
 * │                                                   │
 * │  Current: Pink Floyd Radio                        │
 * │                                                   │
 * │  New name:                                        │
 * │  > Pink Floyd Radio_                              │
 * │                                                   │
 * │            Enter to confirm · Esc to cancel       │
 * ╰───────────────────────────────────────────────────╯
 * ```
 */
export const RenameStationOverlay: FC<RenameStationOverlayProps> = ({
	stationId,
	currentName,
	onConfirm,
	onCancel,
	isVisible,
}) => {
	const theme = useTheme();
	const [newName, setNewName] = useState(currentName);

	// Reset input when overlay opens with new station
	useEffect(() => {
		if (isVisible) {
			setNewName(currentName);
		}
	}, [isVisible, currentName]);

	useInput(
		(_input, key) => {
			if (key.escape) {
				onCancel();
			} else if (key.return && stationId && newName.trim()) {
				onConfirm(stationId, newName.trim());
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible || !stationId) {
		return null;
	}

	const title = "Rename Station";
	const titleLineWidth = DIALOG_WIDTH - title.length - 4;

	// Truncate text helper
	const truncate = (text: string, maxLen: number): string =>
		text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;

	return (
		<Box
			position="absolute"
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
			width="100%"
			height="100%"
		>
			<Box flexDirection="column">
				{/* Top border with title */}
				<Text color={theme.colors.border}>
					{BORDER.topLeft}
					{BORDER.horizontal}{" "}
					<Text color={theme.colors.accent} bold>
						{title}
					</Text>{" "}
					{BORDER.horizontal.repeat(Math.max(0, titleLineWidth))}
					{BORDER.topRight}
				</Text>

				{/* Empty line */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{" ".repeat(INNER_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Current name */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{"  "}
					<Text color={theme.colors.textMuted}>Current: </Text>
					<Text color={theme.colors.text}>
						{truncate(currentName, INNER_WIDTH - 14)}
					</Text>
					{" ".repeat(
						Math.max(0, INNER_WIDTH - `Current: ${currentName}`.length - 2),
					)}
					{BORDER.vertical}
				</Text>

				{/* Empty line */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{" ".repeat(INNER_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* New name label */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{"  "}
					<Text color={theme.colors.textMuted}>New name:</Text>
					{" ".repeat(INNER_WIDTH - 12)}
					{BORDER.vertical}
				</Text>

				{/* Text input row */}
				<Box>
					<Text color={theme.colors.border}>{BORDER.vertical}</Text>
					<Text color={theme.colors.accent}>{"  > "}</Text>
					<Box width={INNER_WIDTH - 6}>
						<TextInput
							defaultValue={currentName}
							onChange={setNewName}
							placeholder="Enter new name..."
						/>
					</Box>
					<Text color={theme.colors.border}>{BORDER.vertical}</Text>
				</Box>

				{/* Empty line */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{" ".repeat(INNER_WIDTH)}
					{BORDER.vertical}
				</Text>

				{/* Footer hint */}
				<Text color={theme.colors.border}>
					{BORDER.vertical}
					{" ".repeat(Math.floor((INNER_WIDTH - 32) / 2))}
					<Text color={theme.colors.textMuted}>
						Enter to confirm · Esc to cancel
					</Text>
					{" ".repeat(Math.ceil((INNER_WIDTH - 32) / 2))}
					{BORDER.vertical}
				</Text>

				{/* Bottom border */}
				<Text color={theme.colors.border}>
					{BORDER.bottomLeft}
					{BORDER.horizontal.repeat(INNER_WIDTH)}
					{BORDER.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};

export type { RenameStationOverlayProps };
