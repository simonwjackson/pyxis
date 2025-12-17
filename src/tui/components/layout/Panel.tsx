import { Box, Text } from "ink";
import type { FC, ReactNode } from "react";

type BorderStyle =
	| "single"
	| "double"
	| "round"
	| "bold"
	| "singleDouble"
	| "doubleSingle"
	| "classic";

type PanelProps = {
	readonly title?: string;
	readonly children: ReactNode;
	readonly borderStyle?: BorderStyle;
	readonly width?: number | string;
	readonly height?: number;
	readonly paddingX?: number;
	readonly paddingY?: number;
	readonly flexGrow?: number;
};

/**
 * Panel component with bordered box and optional title.
 *
 * Without title:
 * ```
 * ╭─────────────────────────────────────────────────────────────────────────────╮
 * │  content here                                                               │
 * ╰─────────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * With title (title above border):
 * ```
 * Stations
 * ╭─────────────────────────────────────────────────────────────────────────────╮
 * │  content here                                                               │
 * ╰─────────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Uses Ink's native Box borderStyle for proper full-width handling.
 */
export const Panel: FC<PanelProps> = ({
	title,
	children,
	borderStyle = "round",
	width = "100%",
	height,
	paddingX = 1,
	paddingY = 0,
	flexGrow,
}) => {
	return (
		<Box
			flexDirection="column"
			width={width}
			height={height}
			flexGrow={flexGrow}
		>
			{/* Title row - outside border */}
			{title && (
				<Box paddingLeft={1} marginBottom={0}>
					<Text bold color="cyan">
						{title}
					</Text>
				</Box>
			)}
			{/* Bordered content */}
			<Box
				flexDirection="column"
				borderStyle={borderStyle}
				paddingX={paddingX}
				paddingY={paddingY}
				flexGrow={flexGrow}
			>
				{children}
			</Box>
		</Box>
	);
};
