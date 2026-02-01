type Command = {
	readonly id: string;
	readonly label: string;
	readonly category: "playback" | "navigation" | "station" | "appearance" | "system";
	readonly shortcut?: string;
	readonly action: string;
};

export const commands: readonly Command[] = [
	// Playback
	{ id: "playPause", label: "Play / Pause", category: "playback", shortcut: "Space", action: "playPause" },
	{ id: "skipTrack", label: "Skip Track", category: "playback", shortcut: "N", action: "skipTrack" },
	{ id: "likeTrack", label: "Like Track", category: "playback", shortcut: "+", action: "likeTrack" },
	{ id: "dislikeTrack", label: "Dislike Track", category: "playback", shortcut: "-", action: "dislikeTrack" },
	{ id: "sleepTrack", label: "Sleep Track", category: "playback", shortcut: "Z", action: "sleepTrack" },
	{ id: "bookmarkSong", label: "Bookmark Song", category: "playback", shortcut: "B", action: "bookmarkSong" },

	// Navigation
	{ id: "goToStations", label: "Go to Stations", category: "navigation", shortcut: "1", action: "goToStations" },
	{ id: "goToSearch", label: "Go to Search", category: "navigation", shortcut: "2", action: "goToSearch" },
	{ id: "goToBookmarks", label: "Go to Bookmarks", category: "navigation", shortcut: "3", action: "goToBookmarks" },
	{ id: "goToGenres", label: "Go to Genres", category: "navigation", shortcut: "4", action: "goToGenres" },
	{ id: "goToSettings", label: "Go to Settings", category: "navigation", shortcut: "5", action: "goToSettings" },

	// Appearance
	{ id: "changeTheme", label: "Change Theme", category: "appearance", action: "changeTheme" },

	// System
	{ id: "signOut", label: "Sign Out", category: "system", action: "signOut" },
];

const categoryOrder: readonly string[] = ["playback", "navigation", "appearance", "system"];

export function filterCommands(query: string): readonly Command[] {
	if (!query.trim()) return commands;
	const lower = query.toLowerCase();
	return commands.filter(
		(cmd) =>
			cmd.label.toLowerCase().includes(lower) ||
			cmd.category.toLowerCase().includes(lower),
	);
}

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
