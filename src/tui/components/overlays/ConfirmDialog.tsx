import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import { useTheme } from "../../theme/provider.js";

type ConfirmDialogVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
	readonly title: string;
	readonly message: string;
	readonly detail?: string;
	readonly warning?: string;
	readonly confirmLabel?: string;
	readonly cancelLabel?: string;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
	readonly isVisible: boolean;
	readonly variant?: ConfirmDialogVariant;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
	title,
	message,
	detail,
	warning,
	confirmLabel = "Yes",
	cancelLabel = "No",
	onConfirm,
	onCancel,
	isVisible,
	variant = "info",
}) => {
	const theme = useTheme();

	useInput(
		(input, key) => {
			if (input.toLowerCase() === "y") {
				onConfirm();
			} else if (input.toLowerCase() === "n" || key.escape) {
				onCancel();
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const getVariantColor = (): string => {
		switch (variant) {
			case "danger":
				return theme.colors.error;
			case "warning":
				return theme.colors.warning;
			case "info":
				return theme.colors.info;
		}
	};

	const variantColor = getVariantColor();
	const borderColor = variant === "info" ? theme.colors.border : variantColor;

	// Border characters for round style
	const border = {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	};

	const dialogWidth = 46;
	const innerWidth = dialogWidth - 2;
	const titleWithPadding = ` ${title} `;
	const topBorderAfterTitle = dialogWidth - 3 - titleWithPadding.length;

	const confirmKey = confirmLabel.charAt(0);
	const cancelKey = cancelLabel.charAt(0);

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
				<Text color={borderColor}>
					{border.topLeft}
					{border.horizontal}
					<Text color={variantColor} bold>
						{titleWithPadding}
					</Text>
					{border.horizontal.repeat(topBorderAfterTitle)}
					{border.topRight}
				</Text>

				{/* Empty line */}
				<Text color={borderColor}>
					{border.vertical}
					{" ".repeat(innerWidth)}
					{border.vertical}
				</Text>

				{/* Message line */}
				<Text color={borderColor}>
					{border.vertical}
					{"  "}
					<Text color={theme.colors.text}>
						{message.padEnd(innerWidth - 4)}
					</Text>
					{"  "}
					{border.vertical}
				</Text>

				{/* Detail line (optional) */}
				{detail && (
					<Text color={borderColor}>
						{border.vertical}
						{"  "}
						<Text color={theme.colors.text}>
							{detail.padEnd(innerWidth - 4)}
						</Text>
						{"  "}
						{border.vertical}
					</Text>
				)}

				{/* Empty line */}
				<Text color={borderColor}>
					{border.vertical}
					{" ".repeat(innerWidth)}
					{border.vertical}
				</Text>

				{/* Warning line (optional) */}
				{warning && (
					<>
						<Text color={borderColor}>
							{border.vertical}
							{"  "}
							<Text color={theme.colors.warning}>
								{warning.padEnd(innerWidth - 4)}
							</Text>
							{"  "}
							{border.vertical}
						</Text>
						<Text color={borderColor}>
							{border.vertical}
							{" ".repeat(innerWidth)}
							{border.vertical}
						</Text>
					</>
				)}

				{/* Button row */}
				<Text color={borderColor}>
					{border.vertical}
					{" ".repeat(Math.floor((innerWidth - 15) / 2))}
					<Text color={variantColor}>[</Text>
					<Text color={variantColor} bold>
						{confirmKey}
					</Text>
					<Text color={variantColor}>]</Text>
					<Text color={theme.colors.text}>{confirmLabel.slice(1)}</Text>
					<Text color={theme.colors.textMuted}> / </Text>
					<Text color={theme.colors.textMuted}>[</Text>
					<Text color={theme.colors.text} bold>
						{cancelKey}
					</Text>
					<Text color={theme.colors.textMuted}>]</Text>
					<Text color={theme.colors.text}>{cancelLabel.slice(1)}</Text>
					{" ".repeat(Math.ceil((innerWidth - 15) / 2))}
					{border.vertical}
				</Text>

				{/* Empty line */}
				<Text color={borderColor}>
					{border.vertical}
					{" ".repeat(innerWidth)}
					{border.vertical}
				</Text>

				{/* Bottom border */}
				<Text color={borderColor}>
					{border.bottomLeft}
					{border.horizontal.repeat(innerWidth)}
					{border.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};

export type { ConfirmDialogProps, ConfirmDialogVariant };
