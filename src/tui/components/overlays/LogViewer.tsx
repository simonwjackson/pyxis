import { readFileSync } from "node:fs";
import { Box, Text, useInput } from "ink";
import { type FC, useEffect, useState } from "react";
import { useTheme } from "../../theme/provider.js";
import { getLogPath } from "../../utils/logger.js";

type LogViewerProps = {
	readonly isVisible: boolean;
	readonly onClose: () => void;
};

export const LogViewer: FC<LogViewerProps> = ({ isVisible, onClose }) => {
	const theme = useTheme();
	const [lines, setLines] = useState<string[]>([]);
	const [scrollOffset, setScrollOffset] = useState(0);
	const maxLines = 20;

	// Read log file periodically when visible
	useEffect(() => {
		if (!isVisible) return;

		const readLog = () => {
			try {
				const content = readFileSync(getLogPath(), "utf-8");
				const allLines = content.split("\n").filter((l) => l.trim());
				setLines(allLines);
				// Auto-scroll to bottom
				setScrollOffset(Math.max(0, allLines.length - maxLines));
			} catch {
				setLines(["[No log file yet]"]);
			}
		};

		readLog();
		const interval = setInterval(readLog, 500);
		return () => clearInterval(interval);
	}, [isVisible]);

	useInput(
		(input, key) => {
			if (input === "@" || key.escape) {
				onClose();
			} else if (input === "j" || key.downArrow) {
				setScrollOffset((prev) =>
					Math.min(prev + 1, Math.max(0, lines.length - maxLines)),
				);
			} else if (input === "k" || key.upArrow) {
				setScrollOffset((prev) => Math.max(0, prev - 1));
			} else if (input === "G") {
				setScrollOffset(Math.max(0, lines.length - maxLines));
			} else if (input === "g") {
				setScrollOffset(0);
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) return null;

	const visibleLines = lines.slice(scrollOffset, scrollOffset + maxLines);
	const border = {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	};

	const width = 80;
	const title = " Debug Log ";
	const scrollInfo = ` ${scrollOffset + 1}-${Math.min(scrollOffset + maxLines, lines.length)}/${lines.length} `;

	return (
		<Box
			position="absolute"
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
			width="100%"
			height="100%"
		>
			<Box flexDirection="column" width={width}>
				{/* Top border with title */}
				<Text color={theme.colors.border}>
					{border.topLeft}
					{border.horizontal}
					<Text color={theme.colors.accent}>{title}</Text>
					{border.horizontal.repeat(
						width - title.length - scrollInfo.length - 4,
					)}
					<Text color={theme.colors.textMuted}>{scrollInfo}</Text>
					{border.topRight}
				</Text>

				{/* Log content */}
				{visibleLines.map((line, i) => (
					<Text
						key={`log-${scrollOffset + i}-${line.slice(0, 20)}`}
						color={theme.colors.border}
					>
						{border.vertical}
						<Text color={theme.colors.textMuted}>
							{` ${line.slice(0, width - 4).padEnd(width - 4)} `}
						</Text>
						{border.vertical}
					</Text>
				))}

				{/* Pad empty lines */}
				{Array.from({ length: maxLines - visibleLines.length }).map(
					(_, idx) => {
						const emptyKey = `empty-${scrollOffset}-${visibleLines.length}-${idx}`;
						return (
							<Text key={emptyKey} color={theme.colors.border}>
								{border.vertical}
								{" ".repeat(width - 2)}
								{border.vertical}
							</Text>
						);
					},
				)}

				{/* Bottom border */}
				<Text color={theme.colors.border}>
					{border.bottomLeft}
					{border.horizontal.repeat(width - 2)}
					{border.bottomRight}
				</Text>

				{/* Hints */}
				<Box justifyContent="center">
					<Text color={theme.colors.textMuted}>
						j/k scroll g/G top/bottom @ or esc close
					</Text>
				</Box>
			</Box>
		</Box>
	);
};

export type { LogViewerProps };
