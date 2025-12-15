import { Box, Text } from "ink";
import type { FC } from "react";

type HeaderProps = {
	readonly title: string;
	readonly theme?: string;
	readonly showHelp?: boolean;
	readonly width?: number;
};

/**
 * Header component with rounded border containing app title on left
 * and theme name + help hint on right.
 *
 * Renders:
 * ```
 * ╭─────────────────────────────────────────────────────────────────────────────╮
 * │  ◉ pyxis                                                  tokyonight   ? help │
 * ╰─────────────────────────────────────────────────────────────────────────────╯
 * ```
 */
export const Header: FC<HeaderProps> = ({
	title,
	theme,
	showHelp = true,
	width,
}) => {
	return (
		<Box flexDirection="column" width={width} borderStyle="round" paddingX={1}>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				alignItems="center"
			>
				<Box>
					<Text color="green">{"\u25C9"} </Text>
					<Text bold color="cyan">
						{title}
					</Text>
				</Box>
				<Box>
					{theme && (
						<Text dimColor>
							{theme}
							{"   "}
						</Text>
					)}
					{showHelp && <Text dimColor>? help</Text>}
				</Box>
			</Box>
		</Box>
	);
};
