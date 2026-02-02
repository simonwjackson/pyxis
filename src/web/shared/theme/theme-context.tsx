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

type ThemeContextValue = {
	readonly theme: string;
	readonly setTheme: (name: string) => void;
	readonly themes: readonly string[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Apply theme before React renders to prevent flash
const initialTheme = getSavedTheme();
applyTheme(initialTheme);

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

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
