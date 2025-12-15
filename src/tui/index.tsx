import { render } from "ink";

import { App } from "./App.js";

type TuiOptions = {
	readonly theme?: string;
};

export const startTui = (options: TuiOptions = {}) => {
	const theme = options.theme ?? "pyxis";
	const { waitUntilExit } = render(<App initialTheme={theme} />, {
		exitOnCtrlC: true,
	});

	return waitUntilExit();
};

// Allow direct execution for testing
// If this file is run directly: node dist/tui/index.js
const isMainModule = typeof require !== "undefined" && require.main === module;
if (isMainModule) {
	startTui().catch(console.error);
}
