#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pc from "picocolors";
import {
	registerAccountCommands,
	registerAuthCommands,
	registerBookmarksCommands,
	registerConfigCommands,
	registerPlaylistCommands,
	registerSearchCommand,
	registerStationsCommands,
	registerTrackCommands,
} from "./commands/index.js";

// Version injected at build time for compiled binaries, fallback to package.json
declare const __VERSION__: string | undefined;

function getVersion(): string {
	// Use build-time injected version if available (compiled binary)
	if (typeof __VERSION__ !== "undefined") {
		return __VERSION__;
	}

	// Fallback to package.json for development
	const currentDir = dirname(fileURLToPath(import.meta.url));
	const packageJsonPath = join(currentDir, "../../package.json");
	if (existsSync(packageJsonPath)) {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
			version: string;
		};
		return packageJson.version;
	}

	return "0.0.0-dev";
}

const version = getVersion();

export type GlobalOptions = {
	json: boolean;
	cache: boolean;
	config?: string;
	verbose: boolean;
	quiet: boolean;
};

export type CliContext = {
	options: GlobalOptions;
};

function main(): void {
	const program = new Command();

	program
		.name("pyxis")
		.description("Unofficial Pandora music service CLI client")
		.version(version, "-V, --version", "Show version")
		.helpOption("-h, --help", "Show help");

	program
		.option("-j, --json", "Output in JSON format", false)
		.option("--no-cache", "Skip session caching")
		.option("-c, --config <path>", "Custom config file path")
		.option("-v, --verbose", "Verbose output", false)
		.option("-q, --quiet", "Suppress non-essential output", false);

	program.hook("preAction", (thisCommand, actionCommand) => {
		const opts = program.opts<GlobalOptions>();

		if (opts.verbose && opts.quiet) {
			console.error(pc.red("Error: Cannot use both --verbose and --quiet"));
			process.exit(1);
		}

		const commandWithContext = actionCommand as Command & {
			context?: CliContext;
		};
		commandWithContext.context = {
			options: opts,
		};
	});

	registerAccountCommands(program);
	registerAuthCommands(program);
	registerBookmarksCommands(program);
	registerConfigCommands(program);
	registerPlaylistCommands(program);
	registerSearchCommand(program);
	registerStationsCommands(program);
	registerTrackCommands(program);

	program.addHelpText(
		"after",
		"\n\n" +
			pc.bold("Examples:") +
			'\n  $ pyxis auth login\n  $ pyxis stations list --json\n  $ pyxis playlist get <station-id>\n  $ pyxis search "pink floyd" --type artist\n  $ pyxis account settings\n  $ pyxis account usage\n  $ pyxis config init\n  $ pyxis --config ~/.pyxis.yaml stations list\n  $ pyxis --verbose auth status\n',
	);

	program.parse();
}

main();
