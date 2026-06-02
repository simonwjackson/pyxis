/**
 * @module Config tests
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
  ConfigSchema,
  decodeConfig,
  getPandoraPassword,
  getSoulseekPassword,
  resolveConfig,
} from "./config.js";

const expectDefaultRuntimeConfig = (
  config: ReturnType<typeof decodeConfig>,
): void => {
  expect(config.server.port).toBe(8765);
  expect(config.server.hostname).toBe("localhost");
  expect(config.web.port).toBe(5678);
  expect(config.log.level).toBe("info");
};

describe("ConfigSchema", () => {
  describe("defaults", () => {
    it("provides default values for empty config", () => {
      const config = Schema.decodeUnknownSync(ConfigSchema)({});

      expectDefaultRuntimeConfig(config);
      expect(config.web.allowedHosts).toEqual([]);
      expect(config.androidBridge.enabled).toBe(false);
      expect(config.androidBridge.token).toBeUndefined();
      expect(config.library.albumRelationship.hot.windowDays).toBe(30);
      expect(config.library.albumRelationship.hot.minRecentListens).toBe(3);
    });

    it("preserves custom values when provided", () => {
      const config = decodeConfig({
        server: {
          port: 9000,
          hostname: "myhost",
        },
        web: { port: 3000, allowedHosts: ["example.com"] },
        upgrade: {
          enabled: true,
          radioLookahead: 5,
          retrySchedule: [2, 4, 8],
          storage: { maxCapacityMB: 2048, ttlDays: 60 },
        },
        log: { level: "debug" },
        androidBridge: { enabled: true, token: "bridge-secret" },
        library: {
          albumRelationship: {
            hot: { windowDays: 14, minRecentListens: 5 },
          },
        },
      });

      expect(config.server.port).toBe(9000);
      expect(config.server.hostname).toBe("myhost");
      expect(config.web.port).toBe(3000);
      expect(config.web.allowedHosts).toEqual(["example.com"]);
      expect(config.upgrade.enabled).toBe(true);
      expect(config.upgrade.radioLookahead).toBe(5);
      expect(config.upgrade.retrySchedule).toEqual([2, 4, 8]);
      expect(config.upgrade.storage.maxCapacityMB).toBe(2048);
      expect(config.upgrade.storage.ttlDays).toBe(60);
      expect(config.log.level).toBe("debug");
      expect(config.androidBridge.enabled).toBe(true);
      expect(config.androidBridge.token).toBe("bridge-secret");
      expect(config.library.albumRelationship.hot.windowDays).toBe(14);
      expect(config.library.albumRelationship.hot.minRecentListens).toBe(5);
    });
  });

  describe("source defaults", () => {
    it("provides default source configurations", () => {
      const config = decodeConfig({});

      expect(config.sources.musicbrainz.enabled).toBe(true);
      expect(config.sources.discogs.enabled).toBe(true);
      expect(config.sources.deezer.enabled).toBe(true);
      expect(config.sources.bandcamp.enabled).toBe(true);
      expect(config.sources.soundcloud.enabled).toBe(true);
      expect(config.sources.soulseek.enabled).toBe(false);
      expect(config.sources.soulseek.username).toBeUndefined();
      expect(config.sources.soulseek.maxConcurrentDownloads).toBe(2);
      expect(config.upgrade.enabled).toBe(false);
      expect(config.upgrade.radioLookahead).toBe(3);
      expect(config.upgrade.retrySchedule).toEqual([1, 3, 7, 30]);
      expect(config.upgrade.storage.maxCapacityMB).toBeUndefined();
      expect(config.upgrade.storage.ttlDays).toBeUndefined();
    });

    it("allows disabling sources", () => {
      const config = decodeConfig({
        sources: {
          musicbrainz: { enabled: false },
          discogs: { enabled: false, token: "mytoken" },
        },
      });

      expect(config.sources.musicbrainz.enabled).toBe(false);
      expect(config.sources.discogs.enabled).toBe(false);
      expect(config.sources.discogs.token).toBe("mytoken");
    });

    it("normalizes nullable optional source secrets to undefined", () => {
      const config = decodeConfig({
        sources: {
          pandora: { username: null },
          discogs: { token: null },
          soundcloud: { clientId: null },
          soulseek: { username: null },
        },
        androidBridge: { token: null },
      });

      expect(config.sources.pandora.username).toBeUndefined();
      expect(config.sources.discogs.token).toBeUndefined();
      expect(config.sources.soundcloud.clientId).toBeUndefined();
      expect(config.sources.soulseek.username).toBeUndefined();
      expect(config.androidBridge.token).toBeUndefined();
    });
  });

  describe("validation", () => {
    it("rejects invalid port numbers", () => {
      expect(() => decodeConfig({ server: { port: -1 } })).toThrow();
      expect(() => decodeConfig({ server: { port: 70000 } })).toThrow();
    });

    it("rejects invalid log levels", () => {
      expect(() => decodeConfig({ log: { level: "invalid" } })).toThrow();
    });

    it("rejects invalid source and upgrade invariants", () => {
      expect(() =>
        decodeConfig({ sources: { soulseek: { maxConcurrentDownloads: 0 } } }),
      ).toThrow();
      expect(() =>
        decodeConfig({ upgrade: { retrySchedule: [1, 0, 3] } }),
      ).toThrow();
      expect(() =>
        decodeConfig({ upgrade: { storage: { maxCapacityMB: 0 } } }),
      ).toThrow();
      expect(() =>
        decodeConfig({
          library: { albumRelationship: { hot: { windowDays: 0 } } },
        }),
      ).toThrow();
      expect(() =>
        decodeConfig({
          library: { albumRelationship: { hot: { minRecentListens: 0 } } },
        }),
      ).toThrow();
    });

    it("accepts valid log levels", () => {
      const levels = [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ] as const;
      for (const level of levels) {
        const config = decodeConfig({ log: { level } });
        expect(config.log.level).toBe(level);
      }
    });
  });
});

describe("resolveConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.PYXIS_SERVER_PORT;
    delete process.env.PYXIS_SERVER_HOSTNAME;
    delete process.env.PYXIS_WEB_PORT;
    delete process.env.PYXIS_LOG_LEVEL;
    delete process.env.PYXIS_DISCOGS_TOKEN;
    delete process.env.PYXIS_ANDROID_BRIDGE_ENABLED;
    delete process.env.PYXIS_ANDROID_BRIDGE_TOKEN;
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
  });

  it("returns defaults when config file does not exist", () => {
    const config = resolveConfig("/nonexistent/path/config.yaml");

    expectDefaultRuntimeConfig(config);
  });

  it("applies environment variable overrides for server port", () => {
    process.env.PYXIS_SERVER_PORT = "9999";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.server.port).toBe(9999);
  });

  it("applies environment variable overrides for server hostname", () => {
    process.env.PYXIS_SERVER_HOSTNAME = "myserver";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.server.hostname).toBe("myserver");
  });

  it("applies environment variable overrides for web port", () => {
    process.env.PYXIS_WEB_PORT = "4000";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.web.port).toBe(4000);
  });

  it("applies environment variable overrides for log level", () => {
    process.env.PYXIS_LOG_LEVEL = "debug";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.log.level).toBe("debug");
  });

  it("applies environment variable overrides for discogs token", () => {
    process.env.PYXIS_DISCOGS_TOKEN = "my-discogs-token";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.sources.discogs.token).toBe("my-discogs-token");
  });

  it("applies environment variable overrides for Android bridge guardrail", () => {
    process.env.PYXIS_ANDROID_BRIDGE_ENABLED = "1";
    process.env.PYXIS_ANDROID_BRIDGE_TOKEN = "env-bridge-token";

    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(config.androidBridge.enabled).toBe(true);
    expect(config.androidBridge.token).toBe("env-bridge-token");
  });

  it("applies multiple environment variable overrides", () => {
    process.env.PYXIS_SERVER_PORT = "8000";
    process.env.PYXIS_WEB_PORT = "3000";
    process.env.PYXIS_LOG_LEVEL = "warn";

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
    delete process.env.PYXIS_PANDORA_PASSWORD;
    expect(getPandoraPassword()).toBeUndefined();
  });

  it("returns password when env var is set", () => {
    process.env.PYXIS_PANDORA_PASSWORD = "secret123";
    expect(getPandoraPassword()).toBe("secret123");
  });
});

describe("getSoulseekPassword", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it("returns undefined when env var not set", () => {
    delete process.env.PYXIS_SOULSEEK_PASSWORD;
    expect(getSoulseekPassword()).toBeUndefined();
  });

  it("returns password when env var is set", () => {
    process.env.PYXIS_SOULSEEK_PASSWORD = "secret123";
    expect(getSoulseekPassword()).toBe("secret123");
  });

  it("does not place soulseek password into resolved config", () => {
    process.env.PYXIS_SOULSEEK_PASSWORD = "secret123";
    const config = resolveConfig("/nonexistent/path/config.yaml");

    expect(JSON.stringify(config)).not.toContain("secret123");
  });
});
