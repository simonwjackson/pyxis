import { Box, Text } from "ink";
import type { FC } from "react";

type HintItem = {
	readonly key: string;
	readonly action: string;
};

type FooterProps = {
	readonly hints: readonly HintItem[];
	readonly width?: number;
};

/**
 * Footer component displaying keyboard hints in a horizontal list.
 *
 * Renders:
 * ```
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │  j/k navigate  ⏎ play  space pause  l like  d dislike  / search  ? help    │
 * ```
 */
export const Footer: FC<FooterProps> = ({ hints, width }) => {
	return (
		<Box
			flexDirection="column"
			width={width}
			borderStyle="round"
			borderTop={false}
			paddingX={1}
		>
			<Box flexDirection="row" flexWrap="wrap" gap={2}>
				{hints.map((hint) => (
					<Box key={`${hint.key}-${hint.action}`}>
						<Text bold color="cyan">
							{hint.key}
						</Text>
						<Text dimColor> {hint.action}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
};
