/**
 * @module ThemeContext
 * React context for managing application theme.
 * Persists theme selection to localStorage and applies CSS variables.
 */

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	type ReactNode,
} from "react";
import {
	themes,
	themeNames,
	applyTheme,
	getSavedTheme,
	saveTheme,
} from "../lib/themes";

/**
 * Theme context value providing current theme and setter.
 */
type ThemeContextValue = {
	/** Current active theme name */
	readonly theme: string;
	/** Sets and persists a new theme */
	readonly setTheme: (name: string) => void;
	/** List of available theme names */
	readonly themes: readonly string[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Apply theme before React renders to prevent flash
const initialTheme = getSavedTheme();
applyTheme(initialTheme);

/**
 * Provides theme context to the component tree.
 * Applies theme CSS variables to document root and persists to localStorage.
 *
 * @param children - Child components that can access theme context
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
	const [theme, setThemeState] = useState(initialTheme);

	const setTheme = useCallback((name: string) => {
		if (!(name in themes)) return;
		setThemeState(name);
		applyTheme(name);
		saveTheme(name);
	}, []);

	// Apply on mount in case SSR/hydration differs
	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	return (
		<ThemeContext.Provider
			value={{ theme, setTheme, themes: themeNames }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

/**
 * Accesses the theme context for reading or changing the application theme.
 * Must be used within a ThemeProvider.
 *
 * @returns Theme context with current theme, setter, and available themes
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * const { theme, setTheme, themes } = useTheme();
 * ```
 */
export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
