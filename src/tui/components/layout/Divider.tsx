import { Box, Text } from "ink";
import type { FC } from "react";

type DividerProps = {
	readonly title?: string;
	readonly width?: number;
	readonly character?: string;
};

/**
 * Horizontal divider component with optional inline title.
 *
 * Without title:
 * ```
 * ──────────────────────────────────────────────────────────────────
 * ```
 *
 * With title:
 * ```
 * ─── Title ────────────────────────────────────────────────────────
 * ```
 */
export const Divider: FC<DividerProps> = ({
	title,
	width = 60,
	character = "\u2500",
}) => {
	if (!title) {
		return (
			<Box>
				<Text dimColor>{character.repeat(width)}</Text>
			</Box>
		);
	}

	const titleWithPadding = ` ${title} `;
	const prefixLength = 3;
	const suffixLength = Math.max(
		0,
		width - prefixLength - titleWithPadding.length,
	);

	return (
		<Box>
			<Text dimColor>{character.repeat(prefixLength)}</Text>
			<Text bold>{titleWithPadding}</Text>
			<Text dimColor>{character.repeat(suffixLength)}</Text>
		</Box>
	);
};
