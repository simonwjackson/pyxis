import envPaths from "env-paths"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"

const paths = envPaths("pandora", { suffix: "" })

export const getCacheDir = (): string => paths.cache

export const ensureCacheDir = async (): Promise<string> => {
  const cacheDir = getCacheDir()
  await mkdir(cacheDir, { recursive: true, mode: 0o700 })
  return cacheDir
}

export const getSessionCachePath = (): string =>
  join(getCacheDir(), "session.json")

export const getSessionLockPath = (): string =>
  join(getCacheDir(), "session.lock")
