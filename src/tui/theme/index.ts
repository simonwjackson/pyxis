export type { PyxisTheme } from "./types.js";
export { ThemeProvider, useTheme } from "./provider.js";
export { loadTheme, getDefaultTheme, themeNames } from "./loader.js";

// Re-export individual themes for direct import
export { default as pyxisTheme } from "./themes/pyxis.json" with {
	type: "json",
};
export { default as tokyonightTheme } from "./themes/tokyonight.json" with {
	type: "json",
};
export { default as catppuccinTheme } from "./themes/catppuccin.json" with {
	type: "json",
};
export { default as nordTheme } from "./themes/nord.json" with { type: "json" };
export { default as gruvboxTheme } from "./themes/gruvbox.json" with {
	type: "json",
};
export { default as draculaTheme } from "./themes/dracula.json" with {
	type: "json",
};
export { default as rosePineTheme } from "./themes/rose-pine.json" with {
	type: "json",
};
export { default as systemTheme } from "./themes/system.json" with {
	type: "json",
};
