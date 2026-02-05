/**
 * @module Logger
 * Structured logging utilities using pino with dual output to console and file.
 * Logs are stored in XDG_STATE_HOME/pyxis/ (typically ~/.local/state/pyxis/).
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import type { Logger as PinoLogger } from "pino";
import envPaths from "env-paths";
import { resolveConfig } from "./config.js";

const paths = envPaths("pyxis", { suffix: "" });
const LOG_DIR = paths.log;

let dirCreated = false;

function ensureLogDir() {
	if (!dirCreated) {
		mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
		dirCreated = true;
	}
}

const appConfig = resolveConfig();
const level = appConfig.log.level;

const loggerCache = new Map<string, PinoLogger>();

/**
 * Re-exported pino Logger type for external use.
 * Use `.child({ component: "name" })` for sub-contexts.
 */
export type Logger = PinoLogger;

/**
 * Creates a named logger with dual output to console and file.
 * Logs are pretty-printed to console when TTY, JSON otherwise.
 * File output is always pretty-printed without color.
 *
 * @param name - Logger name, also used as the log filename (e.g., "server" → server.log)
 * @returns A pino logger instance configured for dual output
 *
 * @example
 * ```ts
 * const log = createLogger("server");
 * log.info({ port: 8765 }, "server running");
 * log.child({ component: "trpc" }).warn("request failed");
 * ```
 */
export function createLogger(name: string): PinoLogger {
	const cached = loggerCache.get(name);
	if (cached) return cached;

	ensureLogDir();
	const logFile = join(LOG_DIR, `${name}.log`);

	const targets: pino.TransportTargetOptions[] = [
		// Console: pretty-print when TTY, JSON otherwise
		...(process.stdout.isTTY
			? [
					{
						target: "pino-pretty",
						options: { colorize: true },
						level,
					},
				]
			: [
					{
						target: "pino/file",
						options: { destination: 1 }, // stdout
						level,
					},
				]),
		// File: always pretty-printed without color
		{
			target: "pino-pretty",
			options: {
				colorize: false,
				destination: logFile,
				mkdir: true,
			},
			level,
		},
	];

	const logger = pino({
		name,
		level,
		transport: { targets },
	});

	loggerCache.set(name, logger);
	return logger;
}

/**
 * Returns the base directory where log files are stored.
 * @returns Absolute path to the log directory (XDG_STATE_HOME/pyxis/)
 */
export function getLogDir(): string {
	return LOG_DIR;
}

/**
 * Returns the full path to a specific log file.
 * @param name - Log file name without extension
 * @returns Absolute path to the log file (e.g., ~/.local/state/pyxis/server.log)
 */
export function getLogFile(name: string): string {
	ensureLogDir();
	return join(LOG_DIR, `${name}.log`);
}
