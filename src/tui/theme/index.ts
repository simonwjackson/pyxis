export type { PyxisTheme } from "./types.js";
export { ThemeProvider, useTheme } from "./provider.js";
export { loadTheme, getDefaultTheme, themeNames } from "./loader.js";

// Re-export individual themes for direct import
import pyxisTheme from "./themes/pyxis.json" with { type: "json" };
import tokyonightTheme from "./themes/tokyonight.json" with { type: "json" };
import catppuccinTheme from "./themes/catppuccin.json" with { type: "json" };
import nordTheme from "./themes/nord.json" with { type: "json" };
import gruvboxTheme from "./themes/gruvbox.json" with { type: "json" };
import draculaTheme from "./themes/dracula.json" with { type: "json" };
import rosePineTheme from "./themes/rose-pine.json" with { type: "json" };
import systemTheme from "./themes/system.json" with { type: "json" };

export {
	pyxisTheme,
	tokyonightTheme,
	catppuccinTheme,
	nordTheme,
	gruvboxTheme,
	draculaTheme,
	rosePineTheme,
	systemTheme,
};
