/// Noticing that the served build has moved on.
///
/// The shell names its hashed entry bundle. When the server starts naming a different one,
/// this page is running old code and can only leave that state by reloading. Nothing here
/// reloads on its own: interrupting playback to install an update would be the app deciding
/// its own freshness matters more than the music.

export interface UpdateWatcher {
  /// Begin watching. Calls back once when a newer build is served. Returns a stop function.
  start(onUpdate: () => void): () => void
}

export interface UpdateWatcherConfig {
  /// Reads the deployed shell. Wrapped rather than passed as a bare `fetch`, because an
  /// unbound fetch throws when called without its global as the receiver.
  readonly request: (input: string, init?: RequestInit) => Promise<Response>
  /// The bundle this page is running. Defaults to the module URL of the caller.
  readonly current?: string
  /// A minute is often enough to notice within one sitting and rare enough to stay invisible
  /// in a request log.
  readonly intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 60_000

/// The hashed entry bundle named by a document, or contained in a module URL.
export function bundleOf(text: string): string | undefined {
  return /assets\/index-[A-Za-z0-9_-]+\.js/.exec(text)?.[0]
}

export function createUpdateWatcher(config: UpdateWatcherConfig): UpdateWatcher {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS

  return {
    start(onUpdate) {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined
      // Only meaningful once this page knows what it is running. Without that baseline there
      // is nothing to compare against, and a false banner is worse than none.
      let baseline = config.current

      const check = async () => {
        try {
          // `no-store`, so this reads what the server has now rather than what the browser or
          // the service worker kept.
          const response = await config.request("/", { cache: "no-store" })
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
