import type { PyxisTheme } from "./types.js";
import pyxisTheme from "./themes/pyxis.json" with { type: "json" };
import tokyonightTheme from "./themes/tokyonight.json" with { type: "json" };
import catppuccinTheme from "./themes/catppuccin.json" with { type: "json" };
import nordTheme from "./themes/nord.json" with { type: "json" };
import gruvboxTheme from "./themes/gruvbox.json" with { type: "json" };
import draculaTheme from "./themes/dracula.json" with { type: "json" };
import rosePineTheme from "./themes/rose-pine.json" with { type: "json" };
import systemTheme from "./themes/system.json" with { type: "json" };

const themes: Record<string, PyxisTheme> = {
	pyxis: pyxisTheme as PyxisTheme,
	tokyonight: tokyonightTheme as PyxisTheme,
	catppuccin: catppuccinTheme as PyxisTheme,
	nord: nordTheme as PyxisTheme,
	gruvbox: gruvboxTheme as PyxisTheme,
	dracula: draculaTheme as PyxisTheme,
	"rose-pine": rosePineTheme as PyxisTheme,
	system: systemTheme as PyxisTheme,
};

export const themeNames = Object.keys(themes) as readonly string[];

export function loadTheme(name: string): PyxisTheme {
	const theme = themes[name];
	if (!theme) {
		throw new Error(
			`Unknown theme: ${name}. Available themes: ${themeNames.join(", ")}`,
		);
	}
	return theme;
}

export function getDefaultTheme(): PyxisTheme {
	// pyxis theme always exists in the themes object
	return themes.pyxis as PyxisTheme;
}
