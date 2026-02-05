/**
 * @module logger tests
 * Tests for the logging utilities.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { createLogger, getLogDir, getLogFile, type Logger } from "./logger.js";
import { existsSync } from "node:fs";

describe("createLogger", () => {
	it("returns a pino logger instance", () => {
		const logger = createLogger("test");
		expect(logger).toBeDefined();
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.error).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.debug).toBe("function");
	});

	it("returns the same logger instance for the same name", () => {
		const logger1 = createLogger("cached-test");
		const logger2 = createLogger("cached-test");
		expect(logger1).toBe(logger2);
	});

	it("returns different logger instances for different names", () => {
		const logger1 = createLogger("logger-a");
		const logger2 = createLogger("logger-b");
		expect(logger1).not.toBe(logger2);
	});

	it("creates a logger with the correct name", () => {
		const logger = createLogger("named-test");
		// Logger bindings contain the name
		expect(logger.bindings().name).toBe("named-test");
	});

	it("supports child loggers", () => {
		const logger = createLogger("parent");
		const child = logger.child({ component: "child-component" });
		expect(child).toBeDefined();
		expect(typeof child.info).toBe("function");
	});
});

describe("getLogDir", () => {
	it("returns a string path", () => {
		const dir = getLogDir();
		expect(typeof dir).toBe("string");
	});

	it("returns a path containing 'pyxis'", () => {
		const dir = getLogDir();
		expect(dir).toContain("pyxis");
	});

	it("returns a consistent path", () => {
		const dir1 = getLogDir();
		const dir2 = getLogDir();
		expect(dir1).toBe(dir2);
	});
});

describe("getLogFile", () => {
	it("returns a string path", () => {
		const file = getLogFile("test");
		expect(typeof file).toBe("string");
	});

	it("returns a path ending with .log", () => {
		const file = getLogFile("test");
		expect(file).toMatch(/\.log$/);
	});

	it("includes the log name in the path", () => {
		const file = getLogFile("custom-log");
		expect(file).toContain("custom-log.log");
	});

	it("returns path inside log directory", () => {
		const dir = getLogDir();
		const file = getLogFile("inside-dir");
		expect(file.startsWith(dir)).toBe(true);
	});
});

describe("Logger type", () => {
	it("is assignable to pino.Logger methods", () => {
		const logger: Logger = createLogger("type-test");

		// Verify all standard log methods exist
		expect(typeof logger.trace).toBe("function");
		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
		expect(typeof logger.fatal).toBe("function");
	});
});
