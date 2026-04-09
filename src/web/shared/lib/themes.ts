/**
 * @module Themes
 * Zune-inspired theme definitions and utilities.
 * Warm, muted palettes with bold accent colors.
 */

/**
 * Color palette for a theme.
 */
type ThemeColors = {
	readonly primary: string;
	readonly secondary: string;
	readonly accent: string;
	readonly text: string;
	readonly textMuted: string;
	readonly textDim: string;
	readonly background: string;
	readonly backgroundPanel: string;
	readonly backgroundHighlight: string;
	readonly backgroundElevated: string;
	readonly backgroundSelection: string;
	readonly border: string;
	readonly borderActive: string;
	readonly error: string;
	readonly warning: string;
	readonly success: string;
	readonly playing: string;
	readonly liked: string;
	readonly disliked: string;
	readonly progress: string;
	readonly progressTrack: string;
};

/**
 * Complete theme definition.
 */
type ThemeDefinition = {
	readonly name: string;
	readonly label: string;
	readonly colors: ThemeColors;
	readonly gradient: string;
};

/**
 * All available themes — Zune-inspired palettes.
 */
export const themes: Record<string, ThemeDefinition> = {
	magenta: {
		name: "magenta",
		label: "magenta",
		gradient: "linear-gradient(135deg, #d4377b, #8b1a4a)",
		colors: {
			primary: "#d4377b",
			secondary: "#8b9a3e",
			accent: "#e8a849",
			text: "#ede8e3",
			textMuted: "#9e958b",
			textDim: "#6b6259",
			background: "#1a1714",
			backgroundPanel: "#141210",
			backgroundHighlight: "#2a2520",
			backgroundElevated: "#332e28",
			backgroundSelection: "#4a2038",
			border: "#2e2923",
			borderActive: "#d4377b",
			error: "#c94040",
			warning: "#e8a849",
			success: "#8b9a3e",
			playing: "#8b9a3e",
			liked: "#8b9a3e",
			disliked: "#c94040",
			progress: "#d4377b",
			progressTrack: "#2e2923",
		},
	},
	olive: {
		name: "olive",
		label: "olive",
		gradient: "linear-gradient(135deg, #8b9a3e, #5c6b28)",
		colors: {
			primary: "#8b9a3e",
			secondary: "#d4377b",
			accent: "#c9a84c",
			text: "#e8e4de",
			textMuted: "#9a9288",
			textDim: "#68605a",
			background: "#171a14",
			backgroundPanel: "#121410",
			backgroundHighlight: "#252a20",
			backgroundElevated: "#2e3328",
			backgroundSelection: "#3a4428",
			border: "#282e22",
			borderActive: "#8b9a3e",
			error: "#c94040",
			warning: "#c9a84c",
			success: "#8b9a3e",
			playing: "#8b9a3e",
			liked: "#8b9a3e",
			disliked: "#c94040",
			progress: "#8b9a3e",
			progressTrack: "#282e22",
		},
	},
	amber: {
		name: "amber",
		label: "amber",
		gradient: "linear-gradient(135deg, #e8a849, #b07830)",
		colors: {
			primary: "#e8a849",
			secondary: "#d4377b",
			accent: "#8b9a3e",
			text: "#ede8e0",
			textMuted: "#a09585",
			textDim: "#6e6355",
			background: "#1a1610",
			backgroundPanel: "#14120e",
			backgroundHighlight: "#2c2518",
			backgroundElevated: "#362e20",
			backgroundSelection: "#4a3820",
			border: "#302818",
			borderActive: "#e8a849",
			error: "#c94040",
			warning: "#e8a849",
			success: "#8b9a3e",
			playing: "#8b9a3e",
			liked: "#8b9a3e",
			disliked: "#c94040",
			progress: "#e8a849",
			progressTrack: "#302818",
		},
	},
	ice: {
		name: "ice",
		label: "ice",
		gradient: "linear-gradient(135deg, #6ba3be, #3d7a98)",
		colors: {
			primary: "#6ba3be",
			secondary: "#be6b8a",
			accent: "#a8b06b",
			text: "#e3e8ed",
			textMuted: "#8b959e",
			textDim: "#59636b",
			background: "#14171a",
			backgroundPanel: "#101214",
			backgroundHighlight: "#20252a",
			backgroundElevated: "#282e33",
			backgroundSelection: "#203848",
			border: "#232a2e",
			borderActive: "#6ba3be",
			error: "#c94040",
			warning: "#c9a84c",
			success: "#7a9e5c",
			playing: "#7a9e5c",
			liked: "#7a9e5c",
			disliked: "#c94040",
			progress: "#6ba3be",
			progressTrack: "#232a2e",
		},
	},
	carbon: {
		name: "carbon",
		label: "carbon",
		gradient: "linear-gradient(135deg, #a0a0a0, #606060)",
		colors: {
			primary: "#b0b0b0",
			secondary: "#d4377b",
			accent: "#e8a849",
			text: "#e8e8e8",
			textMuted: "#888888",
			textDim: "#585858",
			background: "#141414",
			backgroundPanel: "#0e0e0e",
			backgroundHighlight: "#222222",
			backgroundElevated: "#2a2a2a",
			backgroundSelection: "#333333",
			border: "#252525",
			borderActive: "#b0b0b0",
			error: "#c94040",
			warning: "#c9a84c",
			success: "#7a9e5c",
			playing: "#7a9e5c",
			liked: "#7a9e5c",
			disliked: "#c94040",
			progress: "#b0b0b0",
			progressTrack: "#252525",
		},
	},
};

/** Array of all theme names */
export const themeNames = Object.keys(themes);

/**
 * Applies a theme by setting CSS custom properties on document root.
 */
export function applyTheme(themeName: string) {
	const theme = themes[themeName];
	if (!theme) return;
	const root = document.documentElement;
	const c = theme.colors;

	root.style.setProperty("--color-bg", c.background);
	root.style.setProperty("--color-bg-panel", c.backgroundPanel);
	root.style.setProperty("--color-bg-highlight", c.backgroundHighlight);
	root.style.setProperty("--color-bg-elevated", c.backgroundElevated);
	root.style.setProperty("--color-bg-selection", c.backgroundSelection);
	root.style.setProperty("--color-text", c.text);
	root.style.setProperty("--color-text-muted", c.textMuted);
	root.style.setProperty("--color-text-dim", c.textDim);
	root.style.setProperty("--color-border", c.border);
	root.style.setProperty("--color-border-active", c.borderActive);
	root.style.setProperty("--color-primary", c.primary);
	root.style.setProperty("--color-secondary", c.secondary);
	root.style.setProperty("--color-accent", c.accent);
	root.style.setProperty("--color-error", c.error);
	root.style.setProperty("--color-warning", c.warning);
	root.style.setProperty("--color-success", c.success);
	root.style.setProperty("--color-playing", c.playing);
	root.style.setProperty("--color-liked", c.liked);
	root.style.setProperty("--color-disliked", c.disliked);
	root.style.setProperty("--color-progress", c.progress);
	root.style.setProperty("--color-progress-track", c.progressTrack);

	updateThemeColor(c.background);
}

/**
 * Updates the browser theme-color meta tag.
 */
export function updateThemeColor(color: string) {
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute("content", color);
}

const STORAGE_KEY = "pyxis-theme";

/**
 * Retrieves the saved theme from localStorage.
 */
export function getSavedTheme(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "magenta";
	} catch {
		return "magenta";
	}
}

/**
 * Persists the theme selection to localStorage.
 */
export function saveTheme(name: string) {
	try {
		localStorage.setItem(STORAGE_KEY, name);
	} catch {
		// localStorage not available
	}
}
