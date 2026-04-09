/**
 * @module Commands
 * Command palette definitions and utilities.
 * Provides keyboard shortcuts and command filtering for the command palette UI.
 */

/**
 * Represents a command in the command palette.
 */
type Command = {
	/** Unique command identifier */
	readonly id: string;
	/** Human-readable command label */
	readonly label: string;
	/** Category for grouping commands */
	readonly category: "playback" | "navigation" | "station" | "appearance";
	/** Keyboard shortcut (e.g., "Space", "N", "+") */
	readonly shortcut?: string;
	/** Action identifier for command execution */
	readonly action: string;
};

/**
 * All available commands in the application.
 * Organized by category: playback, navigation, station, appearance.
 */
export const commands: readonly Command[] = [
	// Playback
	{ id: "playPause", label: "play / pause", category: "playback", shortcut: "Space", action: "playPause" },
	{ id: "skipTrack", label: "skip track", category: "playback", shortcut: "N", action: "skipTrack" },
	{ id: "likeTrack", label: "like track", category: "playback", shortcut: "+", action: "likeTrack" },
	{ id: "dislikeTrack", label: "dislike track", category: "playback", shortcut: "-", action: "dislikeTrack" },
	{ id: "sleepTrack", label: "sleep track", category: "playback", shortcut: "Z", action: "sleepTrack" },
	{ id: "bookmarkSong", label: "bookmark song", category: "playback", shortcut: "B", action: "bookmarkSong" },

	// Navigation
	{ id: "goToStations", label: "go to stations", category: "navigation", shortcut: "1", action: "goToStations" },
	{ id: "goToSearch", label: "go to search", category: "navigation", shortcut: "2", action: "goToSearch" },
	{ id: "goToBookmarks", label: "go to bookmarks", category: "navigation", shortcut: "3", action: "goToBookmarks" },
	{ id: "goToGenres", label: "go to genres", category: "navigation", shortcut: "4", action: "goToGenres" },
	{ id: "goToSettings", label: "go to settings", category: "navigation", shortcut: "5", action: "goToSettings" },

	// Appearance
	{ id: "changeTheme", label: "change theme", category: "appearance", action: "changeTheme" },
];

/** Order in which categories are displayed in the command palette */
const categoryOrder: readonly string[] = ["playback", "navigation", "appearance"];

/**
 * Filters commands by search query.
 * Matches against label and category (case-insensitive).
 *
 * @param query - Search query string
 * @returns Filtered commands matching the query
 */
export function filterCommands(query: string): readonly Command[] {
	if (!query.trim()) return commands;
	const lower = query.toLowerCase();
	return commands.filter(
		(cmd) =>
			cmd.label.toLowerCase().includes(lower) ||
			cmd.category.toLowerCase().includes(lower),
	);
}

/**
 * Groups commands by category for display in the command palette.
 * Categories are ordered according to categoryOrder.
 *
 * @param cmds - Commands to group
 * @returns Array of category groups, each containing a category name and commands
 */
export function groupCommands(
	cmds: readonly Command[],
): readonly { readonly category: string; readonly commands: readonly Command[] }[] {
	const groups = new Map<string, Command[]>();
	for (const cmd of cmds) {
		const existing = groups.get(cmd.category);
		if (existing) {
			existing.push(cmd);
		} else {
			groups.set(cmd.category, [cmd]);
		}
	}
	return categoryOrder
		.filter((cat) => groups.has(cat))
		.map((cat) => ({
			category: cat,
			commands: groups.get(cat) ?? [],
		}));
}
