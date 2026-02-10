/**
 * @module Shortcuts
 * Keyboard shortcut definitions and matching utilities.
 * Provides shortcut configuration and event matching for keyboard navigation.
 */

/**
 * Keyboard shortcut definition.
 */
type Shortcut = {
	/** Key to match (e.g., " " for space, "n" for N key) */
	readonly key: string;
	/** Required modifier keys */
	readonly modifiers?: readonly ("ctrl" | "meta" | "shift" | "alt")[];
	/** Action identifier for dispatch */
	readonly action: string;
	/** Human-readable label for UI display */
	readonly label: string;
	/** Display-friendly key representation (e.g., "Space", "Cmd+K") */
	readonly displayKey: string;
	/** Context where shortcut is active */
	readonly context?: "global" | "playing" | "stations";
};

/**
 * All registered keyboard shortcuts.
 * Includes playback controls, navigation, and UI toggles.
 */
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

/**
 * Checks if an element is a text input that should suppress shortcuts.
 * @param el - Element to check
 * @returns True if element is input, textarea, or contenteditable
 */
function isInputElement(el: Element | null): boolean {
	if (!el) return false;
	const tag = el.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || el.hasAttribute("contenteditable");
}

/**
 * Matches a keyboard event against registered shortcuts.
 * Ignores shortcuts when typing in form elements, except Escape and Cmd/Ctrl+K.
 *
 * @param e - Keyboard event to match
 * @returns Matching shortcut definition, or undefined if no match
 */
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

/**
 * Returns unique shortcuts for display in help UI.
 * Deduplicates actions that have multiple key bindings (e.g., + and = for likeTrack).
 *
 * @returns Array of unique shortcuts for display
 */
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
