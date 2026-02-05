/**
 * @module Config tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resolveConfig, ConfigSchema, getPandoraPassword } from "./config.js";

describe("ConfigSchema", () => {
	describe("defaults", () => {
		it("provides default values for empty config", () => {
			const config = ConfigSchema.parse({});

			expect(config.server.port).toBe(8765);
			expect(config.server.hostname).toBe("localhost");
			expect(config.web.port).toBe(5678);
			expect(config.web.allowedHosts).toEqual([]);
			expect(config.log.level).toBe("info");
		});

		it("preserves custom values when provided", () => {
			const config = ConfigSchema.parse({
				server: { port: 9000, hostname: "myhost" },
				web: { port: 3000, allowedHosts: ["example.com"] },
				log: { level: "debug" },
			});

			expect(config.server.port).toBe(9000);
			expect(config.server.hostname).toBe("myhost");
			expect(config.web.port).toBe(3000);
			expect(config.web.allowedHosts).toEqual(["example.com"]);
			expect(config.log.level).toBe("debug");
		});
	});

	describe("source defaults", () => {
		it("provides default source configurations", () => {
			const config = ConfigSchema.parse({});

			expect(config.sources.musicbrainz.enabled).toBe(true);
			expect(config.sources.discogs.enabled).toBe(true);
			expect(config.sources.deezer.enabled).toBe(true);
			expect(config.sources.bandcamp.enabled).toBe(true);
			expect(config.sources.soundcloud.enabled).toBe(true);
		});

		it("allows disabling sources", () => {
			const config = ConfigSchema.parse({
				sources: {
					musicbrainz: { enabled: false },
					discogs: { enabled: false, token: "mytoken" },
				},
			});

			expect(config.sources.musicbrainz.enabled).toBe(false);
			expect(config.sources.discogs.enabled).toBe(false);
			expect(config.sources.discogs.token).toBe("mytoken");
		});
	});

	describe("validation", () => {
		it("rejects invalid port numbers", () => {
			expect(() => ConfigSchema.parse({ server: { port: -1 } })).toThrow();
			expect(() => ConfigSchema.parse({ server: { port: 70000 } })).toThrow();
		});

		it("rejects invalid log levels", () => {
			expect(() => ConfigSchema.parse({ log: { level: "invalid" } })).toThrow();
		});

		it("accepts valid log levels", () => {
			const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
			for (const level of levels) {
				const config = ConfigSchema.parse({ log: { level } });
				expect(config.log.level).toBe(level);
			}
		});
	});
});

describe("resolveConfig", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Clear relevant env vars
		delete process.env["PYXIS_SERVER_PORT"];
		delete process.env["PYXIS_SERVER_HOSTNAME"];
		delete process.env["PYXIS_WEB_PORT"];
		delete process.env["PYXIS_LOG_LEVEL"];
		delete process.env["PYXIS_DISCOGS_TOKEN"];
	});

	afterEach(() => {
		// Restore original env
		Object.assign(process.env, originalEnv);
	});

	it("returns defaults when config file does not exist", () => {
		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.server.port).toBe(8765);
		expect(config.server.hostname).toBe("localhost");
		expect(config.web.port).toBe(5678);
		expect(config.log.level).toBe("info");
	});

	it("applies environment variable overrides for server port", () => {
		process.env["PYXIS_SERVER_PORT"] = "9999";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.server.port).toBe(9999);
	});

	it("applies environment variable overrides for server hostname", () => {
		process.env["PYXIS_SERVER_HOSTNAME"] = "myserver";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.server.hostname).toBe("myserver");
	});

	it("applies environment variable overrides for web port", () => {
		process.env["PYXIS_WEB_PORT"] = "4000";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.web.port).toBe(4000);
	});

	it("applies environment variable overrides for log level", () => {
		process.env["PYXIS_LOG_LEVEL"] = "debug";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.log.level).toBe("debug");
	});

	it("applies environment variable overrides for discogs token", () => {
		process.env["PYXIS_DISCOGS_TOKEN"] = "my-discogs-token";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.sources.discogs.token).toBe("my-discogs-token");
	});

	it("applies multiple environment variable overrides", () => {
		process.env["PYXIS_SERVER_PORT"] = "8000";
		process.env["PYXIS_WEB_PORT"] = "3000";
		process.env["PYXIS_LOG_LEVEL"] = "warn";

		const config = resolveConfig("/nonexistent/path/config.yaml");

		expect(config.server.port).toBe(8000);
		expect(config.web.port).toBe(3000);
		expect(config.log.level).toBe("warn");
	});
});

describe("getPandoraPassword", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		Object.assign(process.env, originalEnv);
	});

	it("returns undefined when env var not set", () => {
		delete process.env["PYXIS_PANDORA_PASSWORD"];
		expect(getPandoraPassword()).toBeUndefined();
	});

	it("returns password when env var is set", () => {
		process.env["PYXIS_PANDORA_PASSWORD"] = "secret123";
		expect(getPandoraPassword()).toBe("secret123");
	});
});
