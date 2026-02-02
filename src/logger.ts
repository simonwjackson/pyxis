import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import type { Logger as PinoLogger } from "pino";
import envPaths from "env-paths";

const paths = envPaths("pyxis", { suffix: "" });
const LOG_DIR = paths.log;

let dirCreated = false;

function ensureLogDir() {
	if (!dirCreated) {
		mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
		dirCreated = true;
	}
}

const level = (process.env["LOG_LEVEL"] ?? "info") as pino.Level;

const loggerCache = new Map<string, PinoLogger>();

export type Logger = PinoLogger;

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

export function getLogDir(): string {
	return LOG_DIR;
}

export function getLogFile(name: string): string {
	ensureLogDir();
	return join(LOG_DIR, `${name}.log`);
}
