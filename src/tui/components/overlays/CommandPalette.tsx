import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { type FC, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { Divider, Panel } from "../layout/index.js";

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

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			position="absolute"
			marginTop={2}
		>
			<Panel title="Commands" width={60}>
				<Box flexDirection="column" gap={1}>
					{/* Search input */}
					<Box>
						<Text color={theme.colors.primary}>{"> "}</Text>
						<TextInput
							placeholder="Type to filter..."
							onChange={handleFilterChange}
						/>
					</Box>

					{/* Command list */}
					<Box flexDirection="column">
						{groupedCommands.map((group, groupIndex) => (
							<Box flexDirection="column" key={group.category ?? "ungrouped"}>
								{/* Show divider between groups (not before first) */}
								{groupIndex > 0 && (
									<Box marginY={0}>
										<Divider width={54} />
									</Box>
								)}

								{/* Commands in this group */}
								{group.commands.map((cmd) => {
									const flatIndex = currentFlatIndex++;
									const isSelected = flatIndex === selectedIndex;

									return (
										<CommandItem
											key={cmd.id}
											command={cmd}
											isSelected={isSelected}
										/>
									);
								})}
							</Box>
						))}

						{/* Empty state */}
						{flatCommands.length === 0 && (
							<Box justifyContent="center" paddingY={1}>
								<Text color={theme.colors.textMuted}>No matching commands</Text>
							</Box>
						)}
					</Box>
				</Box>
			</Panel>
		</Box>
	);
};

type CommandItemProps = {
	readonly command: Command;
	readonly isSelected: boolean;
};

const CommandItem: FC<CommandItemProps> = ({ command, isSelected }) => {
	const theme = useTheme();

	const indicatorColor = isSelected ? theme.colors.primary : theme.colors.text;

	return (
		<Box>
			{/* Selection indicator */}
			<Box width={2}>
				<Text color={indicatorColor}>{isSelected ? "\u203A" : " "}</Text>
			</Box>

			{/* Command name */}
			<Box width={20}>
				<Text
					color={isSelected ? theme.colors.text : theme.colors.textMuted}
					bold={isSelected}
				>
					{command.name}
				</Text>
			</Box>

			{/* Description */}
			<Box flexGrow={1}>
				<Text color={theme.colors.textDim}>{command.description}</Text>
			</Box>

			{/* Shortcut (if available) */}
			{command.shortcut && (
				<Box marginLeft={1}>
					<Text color={theme.colors.textMuted} dimColor>
						{command.shortcut}
					</Text>
				</Box>
			)}
		</Box>
	);
};

export type { Command, CommandPaletteProps };
