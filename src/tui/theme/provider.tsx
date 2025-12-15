import { createContext, useContext, type ReactNode } from "react";
import type { PyxisTheme } from "./types.js";
import pyxisTheme from "./themes/pyxis.json" with { type: "json" };

const ThemeContext = createContext<PyxisTheme | null>(null);

export function useTheme(): PyxisTheme {
	const theme = useContext(ThemeContext);
	if (!theme) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return theme;
}

type ThemeProviderProps = {
	readonly theme?: PyxisTheme;
	readonly children: ReactNode;
};

export function ThemeProvider({
	theme = pyxisTheme as PyxisTheme,
	children,
}: ThemeProviderProps): ReactNode {
	return (
		<ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
	);
}
