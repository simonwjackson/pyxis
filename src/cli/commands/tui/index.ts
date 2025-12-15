import { Command } from "commander";

export const tuiCommand = new Command("tui")
	.description("Launch interactive terminal UI")
	.option("-t, --theme <name>", "Color theme", "pyxis")
	.action(async (options: { theme: string }) => {
		// Dynamic import to avoid loading React for non-TUI commands
		const { startTui } = await import("../../../tui/index.js");
		await startTui({ theme: options.theme });
	});

export const registerTuiCommand = (program: Command): void => {
	program.addCommand(tuiCommand);
};
