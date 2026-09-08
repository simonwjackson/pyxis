/// The library screen's only state reader.
///
/// Everything below this file receives plain data as props. This is the one place that
/// opens the worker, reads local storage, reconciles with the server and interprets
/// failures. Screens call it once; nothing else may.
///
/// The reading order is offline-first on purpose. Local data is shown the moment it is
/// readable, marked `local`, and only then upgraded to `live` or degraded to a stated
/// reason. A device with a full library never blanks because the network went away.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RpcLibraryAlbum } from "../../../../contracts/generated/pyxis"
import type { WorkerClient } from "../../../app/src/worker/client.ts"
import { type AlbumView, readAlbums } from "../model/album"
import {
  afterSync,
  loading,
  type Remote,
  ready,
  type SyncOutcome,
  unavailable,
  unknown,
} from "../model/edge"
import { type LibraryView, readNotices, type SyncNoticeRecord } from "../model/library"
import { type OfflineOverviewRecord, readOfflineOverview } from "../model/offline"

/// The narrow slice of the worker this screen needs.
///
/// Declared as a port so a test can supply real responses without standing up a browser
/// database, and so the screen cannot quietly reach for a capability it has not declared.
///
/// Callers must pass a stable reference. Reconciliation restarts when this identity
/// changes, which is exactly right for an account switch and exactly wrong for an object
/// rebuilt every render — the latter reconciles without end.
export interface LibraryEdge {
  open(): Promise<{ readonly ephemeral?: boolean }>
  albums(): Promise<readonly RpcLibraryAlbum[]>
  offlineOverview(): Promise<OfflineOverviewRecord>
  settings(): Promise<{ readonly syncNotices?: readonly SyncNoticeRecord[] }>
  sync(origin?: string): Promise<SyncOutcome>
}

/// Proof that the real worker client satisfies the port above.
///
/// This is the seam. If the worker's shape drifts, it fails to compile here rather than
/// mismapping at runtime. Written so a mismatch is an error: a conditional yielding `never`
/// would satisfy `extends true` and prove nothing, because `never` is assignable to
/// everything. Yielding `false` is what makes the check bite. Type-level only; emits nothing.
type Assert<T extends true> = T
export type LibraryEdgeIsSatisfiedByWorkerClient = Assert<
  WorkerClient extends LibraryEdge ? true : false
>

const EMPTY: readonly AlbumView[] = []

export interface LibraryBinding extends LibraryView {
  /// Re-read local data and reconcile again. Safe to call while offline.
  readonly refresh: () => void
}

export function useLibrary(edge: LibraryEdge): LibraryBinding {
  const [albums, setAlbums] = useState<Remote<readonly AlbumView[]>>(unknown<readonly AlbumView[]>)
  const [notices, setNotices] = useState<readonly SyncNoticeRecord[]>([])
  const [pendingWrites, setPendingWrites] = useState(0)
  const [offlineSupported, setOfflineSupported] = useState(false)
  const [offlineBytes, setOfflineBytes] = useState(0)

  /// Guards against a slow earlier read overwriting a newer one. Without this, a sync that
  /// started before a refresh can land after it and reinstate data the person already
  /// replaced. Bumping it also cancels in-flight work on unmount.
  const generation = useRef(0)

  const run = useCallback(async () => {
    generation.current += 1
    const mine = generation.current
    const current = () => generation.current === mine
    setAlbums(loading<readonly AlbumView[]>())
    let supported = false
    try {
      const report = await edge.open()
      if (!current()) return
      // An ephemeral store keeps nothing after the page closes. Intent may still be
      // recorded, but this client must not promise offline support while it is true.
      supported = report.ephemeral !== true
      setOfflineSupported(supported)
    } catch (cause) {
      if (!current()) return
      setOfflineSupported(false)
      setAlbums(unavailable({ kind: "failed", message: String(cause) }))
      return
    }

    let overview: OfflineOverviewRecord | undefined
    try {
      overview = await edge.offlineOverview()
      if (!current()) return
      setOfflineBytes(overview.totalBytes)
      // The device is the authority on whether bytes can be kept at all.
      supported = supported && overview.available
      setOfflineSupported(supported)
    } catch {
      // A failed overview is not a failed library. Leave offline facts unknown, which
      // renders as "unknown" rather than as "missing".
      overview = undefined
    }

    const index = overview === undefined ? undefined : readOfflineOverview(overview)

    let local: readonly AlbumView[] = EMPTY
    try {
      const rows = await edge.albums()
      if (!current()) return
      local = readAlbums(rows, index)
      setAlbums(ready(local, "local"))
    } catch (cause) {
      if (!current()) return
      setAlbums(unavailable({ kind: "failed", message: String(cause) }))
      return
    }

    try {
      const settings = await edge.settings()
      if (!current()) return
      setNotices(settings.syncNotices ?? [])
    } catch {
      // Notices are an addition to the screen, never a precondition for it.
    }

    let outcome: SyncOutcome
    try {
      outcome = await edge.sync()
    } catch (cause) {
      if (!current()) return
      setAlbums(unavailable({ kind: "failed", message: String(cause) }, local))
      return
    }
    if (!current()) return
    setPendingWrites(outcome.deferred)

    // Re-read after reconciling: sync is what brought new rows in.
    let reconciled = local
    try {
      const rows = await edge.albums()
      if (!current()) return
      const refreshed =
        overview === undefined
          ? undefined
          : readOfflineOverview(await edge.offlineOverview().catch(() => overview))
      reconciled = readAlbums(rows, refreshed ?? index)
    } catch {
      // Keep what was already shown. The sync outcome below still reports the truth.
    }
    if (!current()) return
    setAlbums(afterSync(reconciled, outcome, outcome.albumPullFailed === true))

    try {
      const settings = await edge.settings()
      if (!current()) return
      setNotices(settings.syncNotices ?? [])
    } catch {
      // As above.
    }
  }, [edge])

  useEffect(() => {
    void run()
    // Invalidate in-flight work so a late response cannot write after unmount.
    return () => {
      generation.current += 1
    }
  }, [run])

  const refresh = useCallback(() => {
    void run()
  }, [run])
  const readable = useMemo(() => readNotices(notices), [notices])

  return {
    albums,
    notices: readable,
    pendingWrites,
    offlineSupported,
    offlineBytes,
    refresh,
  }
}
