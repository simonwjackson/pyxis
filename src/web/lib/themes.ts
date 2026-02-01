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

type ThemeDefinition = {
	readonly name: string;
	readonly label: string;
	readonly colors: ThemeColors;
	readonly gradient: string;
};

export const themes: Record<string, ThemeDefinition> = {
	system: {
		name: "system",
		label: "System",
		gradient: "linear-gradient(135deg, #22d3ee, #06b6d4)",
		colors: {
			primary: "#06b6d4",
			secondary: "#a855f7",
			accent: "#eab308",
			text: "#f4f4f5",
			textMuted: "#a1a1aa",
			textDim: "#71717a",
			background: "#18181b",
			backgroundPanel: "#09090b",
			backgroundHighlight: "#27272a",
			backgroundSelection: "#164e63",
			border: "#27272a",
			borderActive: "#06b6d4",
			error: "#ef4444",
			warning: "#eab308",
			success: "#22c55e",
			playing: "#22c55e",
			liked: "#22c55e",
			disliked: "#ef4444",
			progress: "#06b6d4",
			progressTrack: "#27272a",
		},
	},
	pyxis: {
		name: "pyxis",
		label: "Pyxis",
		gradient: "linear-gradient(135deg, #ff6b9d, #f8b500)",
		colors: {
			primary: "#ff6b9d",
			secondary: "#c44569",
			accent: "#f8b500",
			text: "#ffffff",
			textMuted: "#a0a0a0",
			textDim: "#606060",
			background: "#1a1a2e",
			backgroundPanel: "#16213e",
			backgroundHighlight: "#0f3460",
			backgroundSelection: "#533483",
			border: "#3a3a5c",
			borderActive: "#ff6b9d",
			error: "#ff4757",
			warning: "#ffa502",
			success: "#2ed573",
			playing: "#2ed573",
			liked: "#ff6b9d",
			disliked: "#ff4757",
			progress: "#ff6b9d",
			progressTrack: "#3a3a5c",
		},
	},
	tokyonight: {
		name: "tokyonight",
		label: "Tokyo Night",
		gradient: "linear-gradient(135deg, #7aa2f7, #bb9af7)",
		colors: {
			primary: "#7aa2f7",
			secondary: "#bb9af7",
			accent: "#e0af68",
			text: "#c0caf5",
			textMuted: "#9aa5ce",
			textDim: "#565f89",
			background: "#1a1b26",
			backgroundPanel: "#16161e",
			backgroundHighlight: "#292e42",
			backgroundSelection: "#33467c",
			border: "#414868",
			borderActive: "#7aa2f7",
			error: "#f7768e",
			warning: "#e0af68",
			success: "#9ece6a",
			playing: "#9ece6a",
			liked: "#f7768e",
			disliked: "#db4b4b",
			progress: "#7aa2f7",
			progressTrack: "#414868",
		},
	},
	catppuccin: {
		name: "catppuccin",
		label: "Catppuccin",
		gradient: "linear-gradient(135deg, #f5c2e7, #cba6f7)",
		colors: {
			primary: "#cba6f7",
			secondary: "#f5c2e7",
			accent: "#f9e2af",
			text: "#cdd6f4",
			textMuted: "#a6adc8",
			textDim: "#6c7086",
			background: "#1e1e2e",
			backgroundPanel: "#181825",
			backgroundHighlight: "#313244",
			backgroundSelection: "#45475a",
			border: "#585b70",
			borderActive: "#cba6f7",
			error: "#f38ba8",
			warning: "#fab387",
			success: "#a6e3a1",
			playing: "#a6e3a1",
			liked: "#f38ba8",
			disliked: "#eba0ac",
			progress: "#cba6f7",
			progressTrack: "#585b70",
		},
	},
	nord: {
		name: "nord",
		label: "Nord",
		gradient: "linear-gradient(135deg, #88c0d0, #81a1c1)",
		colors: {
			primary: "#88c0d0",
			secondary: "#81a1c1",
			accent: "#ebcb8b",
			text: "#eceff4",
			textMuted: "#d8dee9",
			textDim: "#4c566a",
			background: "#2e3440",
			backgroundPanel: "#3b4252",
			backgroundHighlight: "#434c5e",
			backgroundSelection: "#4c566a",
			border: "#4c566a",
			borderActive: "#88c0d0",
			error: "#bf616a",
			warning: "#d08770",
			success: "#a3be8c",
			playing: "#a3be8c",
			liked: "#bf616a",
			disliked: "#d08770",
			progress: "#88c0d0",
			progressTrack: "#4c566a",
		},
	},
	gruvbox: {
		name: "gruvbox",
		label: "Gruvbox",
		gradient: "linear-gradient(135deg, #fabd2f, #fb4934)",
		colors: {
			primary: "#fabd2f",
			secondary: "#fe8019",
			accent: "#8ec07c",
			text: "#ebdbb2",
			textMuted: "#bdae93",
			textDim: "#665c54",
			background: "#282828",
			backgroundPanel: "#1d2021",
			backgroundHighlight: "#3c3836",
			backgroundSelection: "#504945",
			border: "#504945",
			borderActive: "#fabd2f",
			error: "#fb4934",
			warning: "#fe8019",
			success: "#b8bb26",
			playing: "#b8bb26",
			liked: "#fb4934",
			disliked: "#cc241d",
			progress: "#fabd2f",
			progressTrack: "#504945",
		},
	},
	dracula: {
		name: "dracula",
		label: "Dracula",
		gradient: "linear-gradient(135deg, #bd93f9, #50fa7b)",
		colors: {
			primary: "#bd93f9",
			secondary: "#ff79c6",
			accent: "#f1fa8c",
			text: "#f8f8f2",
			textMuted: "#bfbfbf",
			textDim: "#6272a4",
			background: "#282a36",
			backgroundPanel: "#21222c",
			backgroundHighlight: "#44475a",
			backgroundSelection: "#44475a",
			border: "#6272a4",
			borderActive: "#bd93f9",
			error: "#ff5555",
			warning: "#ffb86c",
			success: "#50fa7b",
			playing: "#50fa7b",
			liked: "#ff79c6",
			disliked: "#ff5555",
			progress: "#bd93f9",
			progressTrack: "#6272a4",
		},
	},
	"rose-pine": {
		name: "rose-pine",
		label: "Rose Pine",
		gradient: "linear-gradient(135deg, #ebbcba, #f6c177)",
		colors: {
			primary: "#ebbcba",
			secondary: "#c4a7e7",
			accent: "#f6c177",
			text: "#e0def4",
			textMuted: "#908caa",
			textDim: "#6e6a86",
			background: "#191724",
			backgroundPanel: "#1f1d2e",
			backgroundHighlight: "#26233a",
			backgroundSelection: "#403d52",
			border: "#524f67",
			borderActive: "#ebbcba",
			error: "#eb6f92",
			warning: "#f6c177",
			success: "#9ccfd8",
			playing: "#9ccfd8",
			liked: "#eb6f92",
			disliked: "#eb6f92",
			progress: "#ebbcba",
			progressTrack: "#524f67",
		},
	},
};

export const themeNames = Object.keys(themes);

export function applyTheme(themeName: string) {
	const theme = themes[themeName];
	if (!theme) return;
	const root = document.documentElement;
	const c = theme.colors;

	root.style.setProperty("--color-bg", c.background);
	root.style.setProperty("--color-bg-panel", c.backgroundPanel);
	root.style.setProperty("--color-bg-highlight", c.backgroundHighlight);
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

export function updateThemeColor(color: string) {
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute("content", color);
}

const STORAGE_KEY = "pyxis-theme";

export function getSavedTheme(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? "system";
	} catch {
		return "system";
	}
}

export function saveTheme(name: string) {
	try {
		localStorage.setItem(STORAGE_KEY, name);
	} catch {
		// localStorage not available
	}
}
