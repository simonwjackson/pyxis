/// Pull before push, keep network calls outside local storage locks, and hand every
/// local outcome to the database's settlement operation. Placement policy stays pure.
import type {
  RpcLibraryAlbum,
  RpcPlacement,
  RpcSession,
} from "../../../../contracts/generated/pyxis"
import { RpcError, type WorkerRpc } from "../rpc/client"
import { resolvePlacement } from "./conflict"
import type {
  WorkerDatabase,
  WorkerOutboxEntry,
  WorkerOutboxVerdict,
  WorkerSettlementAction,
  WorkerSettlementResult,
} from "./contract"
import { submitListens } from "./listen-sync"
import { hasRetiredSessionIntent, RETIRED_SESSION_INTENT_BLOCKER } from "./retired-session-intent"

type RemoteAlbums = Map<string, RpcLibraryAlbum>
type RemoteSessions = Map<string, RpcSession>

export interface ConflictReport {
  readonly albumId: string
  readonly kept: RpcPlacement | "removed"
  readonly discarded: RpcPlacement
}

export interface SyncReport {
  readonly pulled: number
  readonly pushed: number
  readonly converged: number
  readonly dropped: readonly { readonly id: string; readonly reason: string }[]
  /// Includes work queued during this pass and domains excluded by scoped sync.
  readonly deferred: number
  readonly conflicts: readonly ConflictReport[]
  readonly offline: boolean
  readonly authRequired: boolean
  /// Pull or local settlement failure. Queued intent stays intact.
  readonly failure?: string
  readonly pageFallbackRequired?: boolean
  readonly albumPullFailed?: boolean
  readonly sessionPullFailed?: boolean
}

export type SyncScope = "all" | "sessions"

export async function sync(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  scope: SyncScope = "all",
): Promise<SyncReport> {
  const skippedAlbums: DomainPull<RemoteAlbums> = { count: 0, offline: false, authRequired: false }
  const [albums, sessions] = await Promise.all([
    scope === "all" ? pullAlbums(database, rpc) : skippedAlbums,
    pullSessions(database, rpc),
  ])
  const failure = [albums.failure, sessions.failure]
    .filter((value): value is string => value !== undefined)
    .join("; ")
  if (albums.authRequired || sessions.authRequired) {
    return {
      pulled: albums.count + sessions.count,
      pushed: 0,
      converged: 0,
      dropped: [],
      deferred: (await database.outbox()).length,
      conflicts: [],
      offline: albums.offline || sessions.offline,
      authRequired: true,
      albumPullFailed: scope === "all" && albums.remote === undefined,
      sessionPullFailed: sessions.remote === undefined,
      ...(failure.length === 0 ? {} : { failure }),
    }
  }
  const push = await drain(database, rpc, albums.remote, sessions.remote, scope)
  const combinedFailure = [failure, push.failure].filter((value) => value).join("; ")
  return {
    ...push,
    pulled: albums.count + sessions.count,
    offline: push.offline || albums.offline || sessions.offline,
    albumPullFailed: scope === "all" && albums.remote === undefined,
    sessionPullFailed: sessions.remote === undefined,
    ...(combinedFailure.length === 0 ? {} : { failure: combinedFailure }),
  }
}

interface DomainPull<T> {
  readonly count: number
  readonly offline: boolean
  readonly authRequired: boolean
  readonly failure?: string
  readonly remote?: T
}

async function pullAlbums(
  database: WorkerDatabase,
  rpc: WorkerRpc,
): Promise<DomainPull<RemoteAlbums>> {
  let remote: readonly RpcLibraryAlbum[]
  try {
    remote = await rpc.listAlbums()
  } catch (cause) {
    return pullFailure(cause)
  }
  return {
    count: await database.applyRemoteAlbums(remote),
    offline: false,
    authRequired: false,
    remote: new Map(remote.map((row) => [row.id, row])),
  }
}

async function pullSessions(
  database: WorkerDatabase,
  rpc: WorkerRpc,
): Promise<DomainPull<RemoteSessions>> {
  let remote: readonly RpcSession[]
  try {
    remote = await rpc.listSessions()
  } catch (cause) {
    return pullFailure(cause)
  }
  return {
    count: await database.applyRemoteSessions(remote),
    offline: false,
    authRequired: false,
    remote: new Map(remote.map((row) => [row.id, row])),
  }
}

function pullFailure<T>(cause: unknown): DomainPull<T> {
  const error = rpcFailure(cause)
  return {
    count: 0,
    offline: error.retryable,
    authRequired: error.auth,
    ...(error.retryable || error.auth ? {} : { failure: error.message }),
  }
}

async function drain(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  albums: RemoteAlbums | undefined,
  sessions: RemoteSessions | undefined,
  scope: SyncScope,
): Promise<Omit<SyncReport, "pulled">> {
  const entries = (await database.outbox()).filter(
    (entry) => scope === "all" || entry.kind === "session.command",
  )
  const conflicts: ConflictReport[] = []
  const dropped: { id: string; reason: string }[] = []
  const failures: string[] = []
  let pushed = 0
  let converged = 0
  let offline = false
  let authRequired = false
  const collect = (id: string, result: WorkerSettlementResult): void => {
    if (result.outcome === "pushed") pushed += 1
    if (result.outcome === "converged" || result.outcome === "conflicted") converged += 1
    if (result.outcome === "dropped") dropped.push({ id, reason: result.reason })
    if (result.outcome === "conflicted") {
      const { albumId, kept, discarded } = result.notice
      conflicts.push({ albumId, kept, discarded })
    }
    if (result.outcome === "deferred") {
      if (result.reason === "auth") authRequired = true
      if (result.reason === "network") offline = true
      if (result.failure !== undefined) failures.push(result.failure)
    }
  }

  for (const kind of ["album.placement", "session.command"] as const) {
    for (const entry of entries) {
      if (entry.kind !== kind || authRequired) continue
      let result: WorkerSettlementResult
      if (hasRetiredSessionIntent(entry)) {
        result = { outcome: "deferred", reason: "storage", failure: RETIRED_SESSION_INTENT_BLOCKER }
      } else if (entry.settlement !== undefined) {
        result = await settle(database, entry.id, resumeAction(entry, albums, sessions))
      } else if (entry.kind === "album.placement" && albums !== undefined) {
        result = await pushPlacement(database, rpc, entry, albums)
      } else if (entry.kind === "session.command" && sessions !== undefined) {
        result = await pushSessionCommand(database, rpc, entry, sessions)
      } else continue
      collect(entry.id, result)
      if (result.outcome === "deferred") break
    }
  }

  const listens = entries.filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "listen.append" }> =>
      entry.kind === "listen.append",
  )
  const pending: typeof listens = []
  if (!authRequired) {
    for (const entry of listens) {
      if (entry.settlement === undefined) pending.push(entry)
      else collect(entry.id, await settle(database, entry.id, { _tag: "Resume" }))
    }
  }
  if (pending.length > 0 && !authRequired) {
    const submission = await submitListens(
      rpc,
      pending.map((entry) => ({ id: entry.id, event: entry.event })),
    )
    for (const id of submission.accepted) {
      collect(
        id,
        await settle(database, id, { _tag: "Settle", verdict: { _tag: "ListenAccepted" } }),
      )
    }
    for (const rejection of submission.rejected) {
      collect(
        rejection.id,
        await settle(database, rejection.id, {
          _tag: "Settle",
          verdict: { _tag: "Rejected", reason: rejection.reason },
        }),
      )
    }
    for (const id of submission.deferred) {
      collect(
        id,
        await settle(database, id, {
          _tag: "Defer",
          cause: submission.authRequired ? "auth" : "network",
          reason: submission.authRequired
            ? "credentials were refused"
            : "listen submission deferred",
        }),
      )
    }
  }
  return {
    pushed,
    converged,
    dropped,
    conflicts,
    offline,
    authRequired,
    deferred: (await database.outbox()).length,
    ...(failures.length === 0 ? {} : { failure: [...new Set(failures)].join("; ") }),
  }
}

async function pushSessionCommand(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  entry: Extract<WorkerOutboxEntry, { kind: "session.command" }>,
  sessions: RemoteSessions,
): Promise<WorkerSettlementResult> {
  const remote = sessions.get(entry.sessionId)
  if (remote === undefined)
    return settle(database, entry.id, { _tag: "Settle", verdict: { _tag: "Removed" } })
  try {
    // Repair interrupted local receipts before removing their only replay evidence.
    const local = (await database.session(entry.sessionId)) ?? remote
    await database.queueSessionCommand(local, entry.command, entry.commandId)
  } catch (cause) {
    return settle(database, entry.id, { _tag: "Defer", cause: "storage", reason: message(cause) })
  }
  let updated: RpcSession | undefined
  try {
    updated = await rpc.runSessionCommand(entry.sessionId, entry.command, entry.commandId)
  } catch (cause) {
    return settle(
      database,
      entry.id,
      rejectedOrDeferred(cause, { _tag: "Session", session: remote }),
    )
  }
  if (updated === undefined) {
    sessions.delete(entry.sessionId)
    return settle(database, entry.id, { _tag: "Settle", verdict: { _tag: "Removed" } })
  }
  sessions.set(updated.id, updated)
  return settle(database, entry.id, {
    _tag: "Settle",
    verdict: { _tag: "SessionAccepted", session: updated },
  })
}

async function pushPlacement(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  entry: Extract<WorkerOutboxEntry, { kind: "album.placement" }>,
  albums: RemoteAlbums,
): Promise<WorkerSettlementResult> {
  const remote = albums.get(entry.albumId)
  const settings = await database.settings()
  const decision = resolvePlacement(
    {
      albumId: entry.albumId,
      placement: entry.placement,
      baseRevision: entry.baseRevision,
      basePlacement: entry.basePlacement,
      queuedAt: entry.createdAt,
      deviceId: settings.deviceId ?? "",
    },
    remote === undefined
      ? undefined
      : {
          placement: remote.placement,
          revision: remote.revision,
          placementUpdatedAt: remote.placementUpdatedAt,
        },
  )
  if (decision.action === "remove") {
    return settle(database, entry.id, { _tag: "Settle", verdict: { _tag: "Removed" } })
  }
  if (remote !== undefined && decision.action === "converged") {
    return settle(database, entry.id, {
      _tag: "Settle",
      verdict: { _tag: "PlacementConverged", album: remote },
    })
  }
  if (remote !== undefined && decision.action === "keepRemote") {
    return settle(database, entry.id, {
      _tag: "Settle",
      verdict: { _tag: "PlacementConflict", album: remote, discarded: decision.discarded },
    })
  }
  let updated: RpcLibraryAlbum | undefined
  try {
    updated = await rpc.setPlacement(entry.albumId, entry.placement)
  } catch (cause) {
    return settle(
      database,
      entry.id,
      rejectedOrDeferred(
        cause,
        remote === undefined ? undefined : { _tag: "Placement", album: remote },
      ),
    )
  }
  if (updated === undefined) {
    albums.delete(entry.albumId)
    return settle(database, entry.id, { _tag: "Settle", verdict: { _tag: "Removed" } })
  }
  albums.set(updated.id, updated)
  return settle(database, entry.id, {
    _tag: "Settle",
    verdict:
      decision.action === "push" && decision.conflict
        ? { _tag: "PlacementConflict", album: updated, discarded: decision.discarded }
        : { _tag: "PlacementAccepted", album: updated },
  })
}

function resumeAction(
  entry: WorkerOutboxEntry,
  albums: RemoteAlbums | undefined,
  sessions: RemoteSessions | undefined,
): WorkerSettlementAction {
  if (entry.kind === "album.placement" && albums !== undefined) {
    const album = albums.get(entry.albumId)
    return {
      _tag: "Resume",
      latest: album === undefined ? { _tag: "Removed" } : { _tag: "Placement", album },
    }
  }
  if (entry.kind === "session.command" && sessions !== undefined) {
    const session = sessions.get(entry.sessionId)
    return {
      _tag: "Resume",
      latest: session === undefined ? { _tag: "Removed" } : { _tag: "Session", session },
    }
  }
  return { _tag: "Resume" }
}

function rejectedOrDeferred(
  cause: unknown,
  restore?: Extract<WorkerOutboxVerdict, { _tag: "Rejected" }>["restore"],
): WorkerSettlementAction {
  const error = rpcFailure(cause)
  if (error.auth || error.retryable) {
    return { _tag: "Defer", cause: error.auth ? "auth" : "network", reason: error.message }
  }
  return {
    _tag: "Settle",
    verdict: {
      _tag: "Rejected",
      reason: error.message,
      ...(restore === undefined ? {} : { restore }),
    },
  }
}

function rpcFailure(cause: unknown): RpcError {
  return cause instanceof RpcError ? cause : new RpcError(String(cause), false)
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function settle(
  database: WorkerDatabase,
  id: string,
  action: WorkerSettlementAction,
): Promise<WorkerSettlementResult> {
  try {
    return await database.settleOutbox(id, action)
  } catch (cause) {
    // The account fence can reject before entering settlement. It must not become a
    // server refusal or permit writes against the account that replaced the caller's.
    return { outcome: "deferred", reason: "storage", failure: message(cause) }
  }
}
