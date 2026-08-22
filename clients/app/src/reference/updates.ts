/// Noticing that the deployed build has moved on.
///
/// There is no service worker yet, so this watches the shell directly. The shell names the
/// hashed asset bundles, so when that name changes a different build is being served and
/// this page is running old code.
///
/// The check is deliberately cheap and honest: it reads the same document the browser
/// would load on a reload, and compares the bundle it names with the one this page is
/// actually running.

export interface UpdateWatcher {
  /// Begin watching. Calls back once when a newer build is found. Returns a stop function.
  start(onUpdate: () => void): () => void
}

export interface UpdateWatcherConfig {
  /// How often to look. A minute is often enough for someone to notice within one sitting
  /// and rare enough to be invisible in a request log.
  readonly intervalMs?: number
  readonly fetch?: typeof fetch
  /// The bundle this page is running. Defaults to the URL of this module.
  readonly current?: string
}

const DEFAULT_INTERVAL_MS = 60_000

export function createUpdateWatcher(config: UpdateWatcherConfig = {}): UpdateWatcher {
  const request = config.fetch ?? globalThis.fetch
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS
  const running = config.current ?? bundleOf(import.meta.url)

  return {
    start(onUpdate) {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined
      // Only meaningful once we know what this page is running. Without it there is
      // nothing to compare against, and a false banner is worse than none.
      let baseline = running

      const check = async () => {
        try {
          // `no-store` so this reads what the server has now, not what the browser kept.
          const response = await request("/", { cache: "no-store" })
          if (!response.ok) return
          const deployed = bundleOf(await response.text())
          if (deployed === undefined) return
          if (baseline === undefined) {
            baseline = deployed
            return
          }
          if (deployed !== baseline && !stopped) {
            stopped = true
            onUpdate()
          }
        } catch {
          // Offline, or the server is restarting. Neither means there is an update.
        }
      }

      const loop = () => {
        if (stopped) return
        timer = setTimeout(() => {
          void check().then(loop)
        }, intervalMs)
      }
      void check().then(loop)

      return () => {
        stopped = true
        if (timer !== undefined) clearTimeout(timer)
      }
    },
  }
}

/// The hashed entry bundle named by a document, or contained in a module URL.
function bundleOf(text: string): string | undefined {
  return /assets\/index-[A-Za-z0-9_-]+\.js/.exec(text)?.[0]
}
