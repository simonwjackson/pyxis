import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function formatArgs(args: readonly unknown[]): string {
	return args
		.map((arg) =>
			typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
		)
		.join(" ");
}

function timestamp(): string {
	return new Date().toISOString().slice(11, 23);
}

export type Logger = {
	readonly logFile: string;
	readonly log: (...args: unknown[]) => void;
	readonly error: (...args: unknown[]) => void;
	readonly warn: (...args: unknown[]) => void;
	readonly write: (text: string) => void;
};

const loggerCache = new Map<string, Logger>();

export function createLogger(name: string): Logger {
	const cached = loggerCache.get(name);
	if (cached) return cached;

	ensureLogDir();
	const logFile = join(LOG_DIR, `${name}.log`);

	// Write header on creation (only once per name)
	writeFileSync(
		logFile,
		`=== Pyxis ${name} log ${new Date().toISOString()} ===\n`,
	);

	const logger: Logger = {
		logFile,
		log(...args: unknown[]) {
			const line = `[${timestamp()}] ${formatArgs(args)}\n`;
			appendFileSync(logFile, line);
			process.stdout.write(line);
		},
		error(...args: unknown[]) {
			const line = `[${timestamp()}] ERROR ${formatArgs(args)}\n`;
			appendFileSync(logFile, line);
			process.stderr.write(line);
		},
		warn(...args: unknown[]) {
			const line = `[${timestamp()}] WARN ${formatArgs(args)}\n`;
			appendFileSync(logFile, line);
			process.stderr.write(line);
		},
		write(text: string) {
			appendFileSync(logFile, text);
		},
	};

	loggerCache.set(name, logger);
	return logger;
}

export function getLogDir(): string {
	return LOG_DIR;
}
