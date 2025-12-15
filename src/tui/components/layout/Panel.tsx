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
};

/**
 * Panel component with bordered box and optional title inline with top border.
 *
 * Renders:
 * ```
 * ╭─ Stations ─────────────────────────────────────────────────────────────────╮
 * │  content here                                                              │
 * ╰────────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Uses Box with borderStyle="round" by default.
 * Title appears as a custom rendered header above the content.
 */
export const Panel: FC<PanelProps> = ({
	title,
	children,
	borderStyle = "round",
	width,
	height,
	paddingX = 1,
	paddingY = 0,
}) => {
	// If no title, render a simple bordered box
	if (!title) {
		return (
			<Box
				flexDirection="column"
				borderStyle={borderStyle}
				width={width}
				height={height}
				paddingX={paddingX}
				paddingY={paddingY}
			>
				{children}
			</Box>
		);
	}

	// With title: render custom border with inline title
	const borderChars = getBorderChars(borderStyle);

	return (
		<Box flexDirection="column" width={width} height={height}>
			{/* Top border with inline title */}
			<Box>
				<Text>
					{borderChars.topLeft}
					{borderChars.horizontal}
				</Text>
				<Text bold> {title} </Text>
				<Text>
					{borderChars.horizontal.repeat(20)}
					{borderChars.topRight}
				</Text>
			</Box>

			{/* Content with side borders */}
			<Box flexDirection="column" paddingX={paddingX} paddingY={paddingY}>
				<Box>
					<Text>{borderChars.vertical}</Text>
					<Box flexDirection="column" flexGrow={1} paddingX={1}>
						{children}
					</Box>
					<Text>{borderChars.vertical}</Text>
				</Box>
			</Box>

			{/* Bottom border */}
			<Box>
				<Text>
					{borderChars.bottomLeft}
					{borderChars.horizontal.repeat(24 + title.length)}
					{borderChars.bottomRight}
				</Text>
			</Box>
		</Box>
	);
};

type BorderChars = {
	readonly topLeft: string;
	readonly topRight: string;
	readonly bottomLeft: string;
	readonly bottomRight: string;
	readonly horizontal: string;
	readonly vertical: string;
};

function getBorderChars(style: BorderStyle): BorderChars {
	const styles: Record<BorderStyle, BorderChars> = {
		round: {
			topLeft: "\u256D",
			topRight: "\u256E",
			bottomLeft: "\u2570",
			bottomRight: "\u256F",
			horizontal: "\u2500",
			vertical: "\u2502",
		},
		single: {
			topLeft: "\u250C",
			topRight: "\u2510",
			bottomLeft: "\u2514",
			bottomRight: "\u2518",
			horizontal: "\u2500",
			vertical: "\u2502",
		},
		double: {
			topLeft: "\u2554",
			topRight: "\u2557",
			bottomLeft: "\u255A",
			bottomRight: "\u255D",
			horizontal: "\u2550",
			vertical: "\u2551",
		},
		bold: {
			topLeft: "\u250F",
			topRight: "\u2513",
			bottomLeft: "\u2517",
			bottomRight: "\u251B",
			horizontal: "\u2501",
			vertical: "\u2503",
		},
		singleDouble: {
			topLeft: "\u2553",
			topRight: "\u2556",
			bottomLeft: "\u2559",
			bottomRight: "\u255C",
			horizontal: "\u2500",
			vertical: "\u2551",
		},
		doubleSingle: {
			topLeft: "\u2552",
			topRight: "\u2555",
			bottomLeft: "\u2558",
			bottomRight: "\u255B",
			horizontal: "\u2550",
			vertical: "\u2502",
		},
		classic: {
			topLeft: "+",
			topRight: "+",
			bottomLeft: "+",
			bottomRight: "+",
			horizontal: "-",
			vertical: "|",
		},
	};

	return styles[style];
}
