type Shortcut = {
	readonly key: string;
	readonly modifiers?: readonly ("ctrl" | "meta" | "shift" | "alt")[];
	readonly action: string;
	readonly label: string;
	readonly displayKey: string;
	readonly context?: "global" | "playing" | "stations";
};

export const shortcuts: readonly Shortcut[] = [
	// Playback
	{ key: " ", action: "playPause", label: "Play / Pause", displayKey: "Space", context: "global" },
	{ key: "n", action: "skipTrack", label: "Skip Track", displayKey: "N", context: "global" },
	{ key: "+", action: "likeTrack", label: "Like Track", displayKey: "+", context: "playing" },
	{ key: "=", action: "likeTrack", label: "Like Track", displayKey: "+", context: "playing" },
	{ key: "-", action: "dislikeTrack", label: "Dislike Track", displayKey: "-", context: "playing" },
	{ key: "z", action: "sleepTrack", label: "Sleep Track", displayKey: "Z", context: "playing" },
	{ key: "i", action: "trackInfo", label: "Track Info", displayKey: "I", context: "playing" },
	{ key: "b", action: "bookmarkSong", label: "Bookmark Song", displayKey: "B", context: "playing" },
	{ key: "B", modifiers: ["shift"], action: "bookmarkArtist", label: "Bookmark Artist", displayKey: "Shift+B", context: "playing" },

	// Navigation
	{ key: "/", action: "goToSearch", label: "Go to Search", displayKey: "/", context: "global" },
	{ key: "?", modifiers: ["shift"], action: "toggleHelp", label: "Toggle Help", displayKey: "?", context: "global" },
	{ key: "k", modifiers: ["meta"], action: "commandPalette", label: "Command Palette", displayKey: "Cmd+K", context: "global" },
	{ key: "k", modifiers: ["ctrl"], action: "commandPalette", label: "Command Palette", displayKey: "Ctrl+K", context: "global" },
	{ key: "Escape", action: "escape", label: "Close / Go Back", displayKey: "Esc", context: "global" },
	{ key: "1", action: "goToStations", label: "Go to Stations", displayKey: "1", context: "global" },
	{ key: "2", action: "goToSearch", label: "Go to Search", displayKey: "2", context: "global" },
	{ key: "3", action: "goToBookmarks", label: "Go to Bookmarks", displayKey: "3", context: "global" },
	{ key: "4", action: "goToGenres", label: "Go to Genres", displayKey: "4", context: "global" },
	{ key: "5", action: "goToSettings", label: "Go to Settings", displayKey: "5", context: "global" },
];

function isInputElement(el: Element | null): boolean {
	if (!el) return false;
	const tag = el.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || el.hasAttribute("contenteditable");
}

export function matchShortcut(
	e: KeyboardEvent,
): Shortcut | undefined {
	// Don't match when typing in form elements (except Escape and Cmd/Ctrl+K)
	const isEscape = e.key === "Escape";
	const isCmdK = e.key === "k" && (e.metaKey || e.ctrlKey);
	if (isInputElement(document.activeElement) && !isEscape && !isCmdK) {
		return undefined;
	}

	for (const shortcut of shortcuts) {
		if (shortcut.key !== e.key) continue;

		const mods = shortcut.modifiers ?? [];
		const needsMeta = mods.includes("meta");
		const needsCtrl = mods.includes("ctrl");
		const needsShift = mods.includes("shift");
		const needsAlt = mods.includes("alt");

		if (needsMeta !== e.metaKey) continue;
		if (needsCtrl !== e.ctrlKey) continue;
		if (needsShift !== e.shiftKey) continue;
		if (needsAlt !== e.altKey) continue;

		return shortcut;
	}

	return undefined;
}

// Get unique display shortcuts (deduplicate actions like likeTrack which has + and =)
export function getDisplayShortcuts(): readonly Shortcut[] {
	const seen = new Set<string>();
	return shortcuts.filter((s) => {
		if (seen.has(s.action)) return false;
		// Skip duplicate ctrl vs meta for command palette
		if (s.action === "commandPalette" && s.modifiers?.includes("ctrl")) return false;
		seen.add(s.action);
		return true;
	});
}
