/// Knows when a newer build is being served, and reloads only when asked.
///
/// A binding because it owns polling against the deployed shell. The one decision it keeps
/// away from everything below it is the reload: a page that reloads itself can end a track
/// halfway through, so the person chooses when the new version arrives.

import { useEffect, useState } from "react"
import { createUpdateWatcher, type UpdateWatcher } from "../rpc/updates.ts"

export interface UpdateEdge {
  readonly request: (input: string, init?: RequestInit) => Promise<Response>
  readonly reload: () => void
  /// The bundle this page is running. Absent in tests and previews.
  readonly current?: string
  readonly intervalMs?: number
  /// Test seam: a watcher standing in for the polling one.
  readonly watcher?: UpdateWatcher
}

export interface UpdateBinding {
  readonly available: boolean
  readonly apply: () => void
  /// The build this page is running, for somewhere to look when you wonder whether a change
  /// reached you. Absent in development, where the shell is served from source and there is
  /// no hashed bundle to name.
  readonly build?: string
}

export function useUpdate(edge: UpdateEdge | undefined): UpdateBinding {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (edge === undefined) return
    const watcher =
      edge.watcher ??
      createUpdateWatcher({
        request: edge.request,
        ...(edge.current === undefined ? {} : { current: edge.current }),
        ...(edge.intervalMs === undefined ? {} : { intervalMs: edge.intervalMs }),
      })
    return watcher.start(() => setAvailable(true))
  }, [edge])

  return {
    available,
    apply: () => edge?.reload(),
    ...(edge?.current === undefined ? {} : { build: edge.current }),
  }
}
