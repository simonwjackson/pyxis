export const SHELL_CACHE_PREFIX = "pyxis-shell-"

export function shellCacheName(assets: readonly string[]): string {
  let hash = 2166136261
  for (const character of [...assets].sort().join("|")) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${SHELL_CACHE_PREFIX}${(hash >>> 0).toString(36)}`
}

export function isShellAsset(pathname: string, assets: ReadonlySet<string>): boolean {
  return assets.has(pathname)
}
