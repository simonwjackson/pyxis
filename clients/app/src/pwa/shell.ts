export const SHELL_CACHE_PREFIX = "pyxis-shell-"
export const NAVIGATION_NETWORK_TIMEOUT_MS = 1_500

export async function navigationShellResponse(
  network: (signal: AbortSignal) => Promise<Response>,
  cached: () => Promise<Response | undefined>,
  timeoutMs = NAVIGATION_NETWORK_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new Error("navigation network timeout"))
    }, timeoutMs)
  })

  try {
    const response = await Promise.race([network(controller.signal), timedOut])
    if (response.ok) return response
  } catch {
    // Offline and captive network stacks may reject or hang. The installed application
    // must reach its durable shell instead of remaining behind the browser's splash screen.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }

  try {
    const response = await cached()
    if (response !== undefined) return response
  } catch {
    // Cache Storage can be blocked independently of the network.
  }
  return new Response("Pyxis is offline and its shell is unavailable.", { status: 503 })
}

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
