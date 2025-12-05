import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { AppConfigSchema, DEFAULT_CONFIG } from "./schema.js"
import { loadConfigFromEnv, ConfigError } from "./loader.js"

describe("config", () => {
  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {}

  const envVars = [
    "PANDORA_USERNAME",
    "PANDORA_PASSWORD",
    "PYXIS_OUTPUT_FORMAT",
    "PYXIS_OUTPUT_VERBOSE",
    "PYXIS_OUTPUT_COLOR",
    "PYXIS_CACHE_ENABLED",
    "PYXIS_CACHE_TTL",
    "PYXIS_CACHE_PATH",
    "PYXIS_PLAYLIST_QUALITY",
    "PYXIS_PLAYLIST_ADDITIONAL_URL",
    "PYXIS_STATIONS_SORT",
    "PYXIS_STATIONS_LIMIT"
  ]

  beforeEach(() => {
    // Save original values
    for (const key of envVars) {
      originalEnv[key] = process.env[key]
    }
    // Clear all config env vars
    for (const key of envVars) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    // Restore original values
    for (const key of envVars) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  describe("AppConfigSchema", () => {
    it("should validate a minimal empty config", () => {
      const result = AppConfigSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it("should validate a complete valid config", () => {
      const config = {
        auth: {
          username: "user@example.com",
          password: "secret"
        },
        output: {
          format: "json",
          verbose: true,
          color: false
        },
        cache: {
          enabled: false,
          ttl: 7200,
          path: "/custom/cache"
        },
        playlist: {
          quality: "medium",
          additionalUrl: "https://example.com"
        },
        stations: {
          sort: "name",
          limit: 50
        }
      }

      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.auth?.username).toBe("user@example.com")
        expect(result.data.output?.format).toBe("json")
        expect(result.data.cache?.ttl).toBe(7200)
        expect(result.data.playlist?.quality).toBe("medium")
        expect(result.data.stations?.sort).toBe("name")
      }
    })

    it("should reject invalid output format", () => {
      const config = {
        output: { format: "invalid" }
      }
      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it("should reject invalid playlist quality", () => {
      const config = {
        playlist: { quality: "ultra" }
      }
      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it("should reject invalid stations sort", () => {
      const config = {
        stations: { sort: "alphabetical" }
      }
      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it("should reject negative cache ttl", () => {
      const config = {
        cache: { ttl: -100 }
      }
      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it("should reject zero stations limit", () => {
      const config = {
        stations: { limit: 0 }
      }
      const result = AppConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it("should apply defaults for missing optional fields", () => {
      const result = AppConfigSchema.parse({
        output: {},
        cache: {},
        playlist: {},
        stations: {}
      })

      expect(result.output?.format).toBe("human")
      expect(result.output?.verbose).toBe(false)
      expect(result.output?.color).toBe(true)
      expect(result.cache?.enabled).toBe(true)
      expect(result.cache?.ttl).toBe(3600)
      expect(result.playlist?.quality).toBe("high")
      expect(result.stations?.sort).toBe("recent")
    })
  })

  describe("DEFAULT_CONFIG", () => {
    it("should have valid default values", () => {
      const result = AppConfigSchema.safeParse(DEFAULT_CONFIG)
      expect(result.success).toBe(true)
    })

    it("should have expected default output settings", () => {
      expect(DEFAULT_CONFIG.output?.format).toBe("human")
      expect(DEFAULT_CONFIG.output?.verbose).toBe(false)
      expect(DEFAULT_CONFIG.output?.color).toBe(true)
    })

    it("should have expected default cache settings", () => {
      expect(DEFAULT_CONFIG.cache?.enabled).toBe(true)
      expect(DEFAULT_CONFIG.cache?.ttl).toBe(3600)
    })

    it("should have expected default playlist settings", () => {
      expect(DEFAULT_CONFIG.playlist?.quality).toBe("high")
    })

    it("should have expected default stations settings", () => {
      expect(DEFAULT_CONFIG.stations?.sort).toBe("recent")
    })
  })

  describe("loadConfigFromEnv", () => {
    it("should return defaults when no env vars set", () => {
      const config = loadConfigFromEnv()

      expect(config.output?.format).toBe("human")
      expect(config.cache?.enabled).toBe(true)
      expect(config.playlist?.quality).toBe("high")
    })

    it("should load auth credentials from env", () => {
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "mypassword"

      const config = loadConfigFromEnv()

      expect(config.auth?.username).toBe("test@example.com")
      expect(config.auth?.password).toBe("mypassword")
    })

    it("should load output settings from env", () => {
      process.env.PYXIS_OUTPUT_FORMAT = "json"
      process.env.PYXIS_OUTPUT_VERBOSE = "true"
      process.env.PYXIS_OUTPUT_COLOR = "false"

      const config = loadConfigFromEnv()

      expect(config.output?.format).toBe("json")
      expect(config.output?.verbose).toBe(true)
      expect(config.output?.color).toBe(false)
    })

    it("should load cache settings from env", () => {
      process.env.PYXIS_CACHE_ENABLED = "false"
      process.env.PYXIS_CACHE_TTL = "7200"
      process.env.PYXIS_CACHE_PATH = "/custom/path"

      const config = loadConfigFromEnv()

      expect(config.cache?.enabled).toBe(false)
      expect(config.cache?.ttl).toBe(7200)
      expect(config.cache?.path).toBe("/custom/path")
    })

    it("should load playlist settings from env", () => {
      process.env.PYXIS_PLAYLIST_QUALITY = "low"
      process.env.PYXIS_PLAYLIST_ADDITIONAL_URL = "https://extra.url"

      const config = loadConfigFromEnv()

      expect(config.playlist?.quality).toBe("low")
      expect(config.playlist?.additionalUrl).toBe("https://extra.url")
    })

    it("should load stations settings from env", () => {
      process.env.PYXIS_STATIONS_SORT = "name"
      process.env.PYXIS_STATIONS_LIMIT = "25"

      const config = loadConfigFromEnv()

      expect(config.stations?.sort).toBe("name")
      expect(config.stations?.limit).toBe(25)
    })

    it("should ignore invalid output format", () => {
      process.env.PYXIS_OUTPUT_FORMAT = "invalid"

      const config = loadConfigFromEnv()

      // Should keep default
      expect(config.output?.format).toBe("human")
    })

    it("should ignore invalid playlist quality", () => {
      process.env.PYXIS_PLAYLIST_QUALITY = "ultra"

      const config = loadConfigFromEnv()

      // Should keep default
      expect(config.playlist?.quality).toBe("high")
    })

    it("should ignore invalid stations sort", () => {
      process.env.PYXIS_STATIONS_SORT = "invalid"

      const config = loadConfigFromEnv()

      // Should keep default
      expect(config.stations?.sort).toBe("recent")
    })

    it("should ignore invalid cache ttl", () => {
      process.env.PYXIS_CACHE_TTL = "not-a-number"

      const config = loadConfigFromEnv()

      // Should keep default
      expect(config.cache?.ttl).toBe(3600)
    })

    it("should ignore negative cache ttl", () => {
      process.env.PYXIS_CACHE_TTL = "-100"

      const config = loadConfigFromEnv()

      // Should keep default
      expect(config.cache?.ttl).toBe(3600)
    })

    it("should handle partial auth config", () => {
      process.env.PANDORA_USERNAME = "onlyuser@example.com"
      // password not set

      const config = loadConfigFromEnv()

      expect(config.auth?.username).toBe("onlyuser@example.com")
      expect(config.auth?.password).toBeUndefined()
    })
  })
})
