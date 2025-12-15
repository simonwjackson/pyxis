import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOG_FILE = join(tmpdir(), "pyxis-tui.log");

// Clear log on startup
let initialized = false;

function ensureInit() {
	if (!initialized) {
		writeFileSync(
			LOG_FILE,
			`=== Pyxis TUI Log ${new Date().toISOString()} ===\n`,
		);
		initialized = true;
	}
}

export function log(...args: unknown[]) {
	ensureInit();
	const timestamp = new Date().toISOString().slice(11, 23);
	const message = args
		.map((arg) =>
			typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
		)
		.join(" ");
	appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

export function getLogPath(): string {
	return LOG_FILE;
}
