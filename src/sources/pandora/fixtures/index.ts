import { Effect, Config } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"

export type FixtureMode = "record" | "replay" | "live"

const FIXTURES_DIR = "./fixtures"

export const getFixtureMode = (): Effect.Effect<FixtureMode, never> =>
  Config.string("PYXIS_FIXTURE_MODE").pipe(
    Config.withDefault("live"),
    Effect.map((mode) => {
      if (mode === "record" || mode === "replay") return mode
      return "live"
    }),
    Effect.orElseSucceed(() => "live" as const)
  )

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

export const fixtureExists = (method: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      const filePath = path.join(FIXTURES_DIR, `${method}.json`)
      await fs.access(filePath)
      return true
    },
    catch: () => false
  }).pipe(Effect.orElseSucceed(() => false))
