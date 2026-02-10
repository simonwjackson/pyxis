/**
 * @module pandora/fixtures
 * Test fixture management for recording and replaying API responses.
 * Supports three modes:
 * - "live": Make real network requests (default)
 * - "record": Make real requests and save responses as fixtures
 * - "replay": Load responses from previously recorded fixtures
 */
import { Effect, Config } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"

/**
 * Fixture mode controlling HTTP request behavior.
 * - "live": Make real network requests
 * - "record": Make real requests and save responses
 * - "replay": Load responses from fixtures
 */
export type FixtureMode = "record" | "replay" | "live"

/** Directory where fixture files are stored */
const FIXTURES_DIR = "./fixtures"

/**
 * Gets the current fixture mode from PYXIS_FIXTURE_MODE environment variable.
 * Defaults to "live" if not set or invalid.
 *
 * @returns Effect resolving to the current fixture mode
 */
export const getFixtureMode = (): Effect.Effect<FixtureMode, never> =>
  Config.string("PYXIS_FIXTURE_MODE").pipe(
    Config.withDefault("live"),
    Effect.map((mode) => {
      if (mode === "record" || mode === "replay") return mode
      return "live"
    }),
    Effect.orElseSucceed(() => "live" as const)
  )

/**
 * Saves API response data as a fixture file.
 * Creates the fixtures directory if it doesn't exist.
 *
 * @param method - API method name used as the filename (e.g., "user.getStationList")
 * @param data - Response data to save as JSON
 * @returns Effect that resolves when the file is written
 *
 * @effect
 * - Success: void - file written successfully
 * - Error: Error - filesystem write error
 */
export const saveFixture = (
  method: string,
  data: unknown
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await fs.mkdir(FIXTURES_DIR, { recursive: true })
      const filePath = path.join(FIXTURES_DIR, `${method}.json`)
      await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    },
    catch: (e) => new Error(`Failed to save fixture: ${e}`)
  })

/**
 * Loads a previously saved fixture file.
 *
 * @typeParam T - Expected type of the fixture data
 * @param method - API method name to load fixture for
 * @returns Effect resolving to the parsed fixture data
 *
 * @effect
 * - Success: T - parsed fixture data
 * - Error: Error - file not found or parse error
 */
export const loadFixture = <T>(
  method: string
): Effect.Effect<T, Error> =>
  Effect.tryPromise({
    try: async () => {
      const filePath = path.join(FIXTURES_DIR, `${method}.json`)
      const content = await fs.readFile(filePath, "utf-8")
      return JSON.parse(content) as T
    },
    catch: (e) => new Error(`Failed to load fixture for ${method}: ${e}`)
  })

/**
 * Checks if a fixture file exists for the given API method.
 *
 * @param method - API method name to check
 * @returns Effect resolving to true if fixture exists, false otherwise
 */
export const fixtureExists = (method: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      const filePath = path.join(FIXTURES_DIR, `${method}.json`)
      await fs.access(filePath)
      return true
    },
    catch: () => false
  }).pipe(Effect.orElseSucceed(() => false))
