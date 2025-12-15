import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { type FC, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";

type Command = {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly shortcut?: string;
	readonly category?: string;
};

type CommandPaletteProps = {
	readonly commands: readonly Command[];
	readonly onSelect: (command: Command) => void;
	readonly onClose: () => void;
	readonly isVisible: boolean;
};

/**
 * Command palette overlay for quick command access.
 *
 * ```
 * ╭─ Commands ─────────────────────────────────────────────╮
 * │                                                        │
 * │  > █                                                   │
 * │                                                        │
 * │  › Play station          Start playing selected        │
 * │    Search                Search Pandora                │
 * │    New station           Create a new station          │
 * │    Like track            Thumbs up current track       │
 * │    Dislike track         Thumbs down current track     │
 * │    ──────────────────────────────────────────────────  │
 * │    Theme                 Change color theme            │
 * │    Quality               Set audio quality             │
 * │    Account               View account info             │
 * │    Help                  Show keyboard shortcuts       │
 * │    Quit                  Exit pyxis                    │
 * │                                                        │
 * ╰────────────────────────────────────────────────────────╯
 * ```
 */
export const CommandPalette: FC<CommandPaletteProps> = ({
	commands,
	onSelect,
	onClose,
	isVisible,
}) => {
	const theme = useTheme();
	const [filter, setFilter] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Filter commands based on input
	const filteredCommands = useMemo(() => {
		if (!filter.trim()) {
			return commands;
		}
		const lowerFilter = filter.toLowerCase();
		return commands.filter((cmd) =>
			cmd.name.toLowerCase().includes(lowerFilter),
		);
	}, [commands, filter]);

	// Group commands by category
	const groupedCommands = useMemo(() => {
		const groups: Map<string | undefined, readonly Command[]> = new Map();
		const ungrouped: Command[] = [];

		for (const cmd of filteredCommands) {
			if (cmd.category) {
				const existing = groups.get(cmd.category);
				if (existing) {
					groups.set(cmd.category, [...existing, cmd]);
				} else {
					groups.set(cmd.category, [cmd]);
				}
			} else {
				ungrouped.push(cmd);
			}
		}

		// Return array of [category, commands] pairs for rendering
		const result: Array<{
			category: string | undefined;
			commands: readonly Command[];
		}> = [];

		// Add ungrouped first (no divider before)
		if (ungrouped.length > 0) {
			result.push({ category: undefined, commands: ungrouped });
		}

		// Add grouped commands
		for (const [category, cmds] of groups) {
			result.push({ category, commands: cmds });
		}

		return result;
	}, [filteredCommands]);

	// Flatten for index-based selection
	const flatCommands = useMemo(() => {
		return groupedCommands.flatMap((group) => group.commands);
	}, [groupedCommands]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			if (!isVisible) return;

			// Close on escape
			if (key.escape) {
				setFilter("");
				setSelectedIndex(0);
				onClose();
				return;
			}

			// Execute on enter
			if (key.return) {
				const selected = flatCommands[selectedIndex];
				if (selected) {
					setFilter("");
					setSelectedIndex(0);
					onSelect(selected);
				}
				return;
			}

			// Navigation with j/k or arrows
			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, flatCommands.length - 1));
				return;
			}
			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			// Ctrl+n/p for navigation (vim style)
			if (key.ctrl && input === "n") {
				setSelectedIndex((prev) => Math.min(prev + 1, flatCommands.length - 1));
				return;
			}
			if (key.ctrl && input === "p") {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}
		},
		{ isActive: isVisible },
	);

	// Reset selection when filter changes
	const handleFilterChange = (value: string) => {
		setFilter(value);
		setSelectedIndex(0);
	};

	// Don't render if not visible
	if (!isVisible) {
		return null;
	}

	// Calculate the current flat index for each command
	let currentFlatIndex = 0;

	// Border characters
	const BORDER = {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	} as const;

	const title = "Commands";
	const contentWidth = 58;
	const titleLineWidth = contentWidth - title.length - 3;

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			position="absolute"
			marginTop={2}
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

				{/* Search input line */}
				<Text>
					{BORDER.vertical} <Text color={theme.colors.primary}>{"> "}</Text>
					<TextInput
						placeholder="Type to filter..."
						onChange={handleFilterChange}
					/>
					{BORDER.vertical}
				</Text>

				{/* Empty line */}
				<Text>
					{BORDER.vertical}
					{" ".repeat(contentWidth)}
					{BORDER.vertical}
				</Text>

				{/* Command list */}
				{groupedCommands.map((group, groupIndex) => (
					<Box flexDirection="column" key={group.category ?? "ungrouped"}>
						{/* Show divider between groups (not before first) */}
						{groupIndex > 0 && (
							<Text>
								{BORDER.vertical}{" "}
								<Text color={theme.colors.textMuted}>
									{"─".repeat(contentWidth - 2)}
								</Text>{" "}
								{BORDER.vertical}
							</Text>
						)}

						{/* Commands in this group */}
						{group.commands.map((cmd) => {
							const flatIndex = currentFlatIndex++;
							const isSelected = flatIndex === selectedIndex;

							return (
								<Text key={cmd.id}>
									{BORDER.vertical}
									<CommandItem command={cmd} isSelected={isSelected} />
									{BORDER.vertical}
								</Text>
							);
						})}
					</Box>
				))}

				{/* Empty state */}
				{flatCommands.length === 0 && (
					<Text>
						{BORDER.vertical}
						{" ".repeat(20)}
						<Text color={theme.colors.textMuted}>No matching commands</Text>
						{" ".repeat(18)}
						{BORDER.vertical}
					</Text>
				)}

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

type CommandItemProps = {
	readonly command: Command;
	readonly isSelected: boolean;
};

const CommandItem: FC<CommandItemProps> = ({ command, isSelected }) => {
	const theme = useTheme();

	const nameWidth = 18;
	const descWidth = 30;
	const shortcutWidth = 8;

	return (
		<Text>
			{" "}
			<Text color={isSelected ? theme.colors.primary : theme.colors.text}>
				{isSelected ? "›" : " "}
			</Text>{" "}
			<Text
				color={isSelected ? theme.colors.text : theme.colors.textMuted}
				bold={isSelected}
			>
				{command.name.padEnd(nameWidth)}
			</Text>
			<Text color={theme.colors.textDim}>
				{command.description.slice(0, descWidth).padEnd(descWidth)}
			</Text>
			<Text color={theme.colors.textMuted} dimColor>
				{(command.shortcut ?? "").padStart(shortcutWidth)}
			</Text>
		</Text>
	);
};

export type { Command, CommandPaletteProps };
