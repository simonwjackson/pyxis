/// Two-way sync.
///
/// Order matters and is deliberate: pull first, then push. Pushing blind would send a
/// change based on state the server left behind long ago, and the conflict rules need to
/// know what the server currently holds before they can tell a replay from a real clash.
///
/// Nothing here decides a merge. `conflict.ts` owns every rule, so the policy can be read
/// and argued with in one place.

import type {
  RpcLibraryAlbum,
  RpcPlacement,
  RpcSession,
} from "../../../../contracts/generated/pyxis"

/// The server's own view, kept current as writes land.
///
/// It must be updated as the queue drains. Resolving the second write for an album against
/// the state before the first one landed makes that write look like a replay, and it is
/// then dropped without ever being sent.
type RemoteAlbums = Map<string, RpcLibraryAlbum>
type RemoteSessions = Map<string, RpcSession>

import { RpcError, type WorkerRpc } from "../rpc/client"
import { acceptsRemoteRevision, resolvePlacement } from "./conflict"
import type { OutboxResult, WorkerDatabase, WorkerOutboxEntry, WorkerSyncNotice } from "./contract"
import { submitListens } from "./listen-sync"
import { applySessionCommand } from "./session-local"

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
  readonly deferred: number
  readonly conflicts: readonly ConflictReport[]
  /// True when the network stopped answering partway. The queue is intact.
  readonly offline: boolean
  /// True when the server answered and refused the credentials. Waiting will not fix this;
  /// the device has to be paired again. The queue is intact.
  readonly authRequired: boolean
  /// Set when sync could not run at all, with the reason. The queue is intact.
  readonly failure?: string
  /// An in-process compatibility store cannot issue worker RPC itself. The page can fetch
  /// snapshots directly, but must not claim persistence.
  readonly pageFallbackRequired?: boolean
  readonly albumPullFailed?: boolean
  readonly sessionPullFailed?: boolean
}

export async function sync(database: WorkerDatabase, rpc: WorkerRpc): Promise<SyncReport> {
  const [albums, sessions] = await Promise.all([
    pullAlbums(database, rpc),
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
      albumPullFailed: albums.remote === undefined,
      sessionPullFailed: sessions.remote === undefined,
      ...(failure.length === 0 ? {} : { failure }),
    }
  }

  const push = await drain(database, rpc, albums.remote, sessions.remote)
  return {
    ...push,
    pulled: albums.count + sessions.count,
    offline: push.offline || albums.offline || sessions.offline,
    albumPullFailed: albums.remote === undefined,
    sessionPullFailed: sessions.remote === undefined,
    ...(failure.length === 0 ? {} : { failure }),
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

  const outbox = await database.outbox()
  const queued = new Set(
    outbox
      .filter((entry) => entry.kind === "album.placement")
      .map((entry) => (entry.kind === "album.placement" ? entry.albumId : "")),
  )
  let count = 0
  const remoteIds = new Set(remote.map((album) => album.id))
  for (const album of remote) {
    if (queued.has(album.id)) continue
    const local = await database.album(album.id)
    if (local !== undefined && !acceptsRemoteRevision(local.revision, album.revision)) continue
    await database.putAlbum({ ...album, id: album.id })
    count += 1
  }
  for (const local of await database.albums()) {
    if (remoteIds.has(local.id) || queued.has(local.id)) continue
    await database.removeAlbum(local.id)
    count += 1
  }
  return {
    count,
    offline: false,
    authRequired: false,
    remote: new Map(remote.map((entry) => [entry.id, entry])),
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

  const outbox = await database.outbox()
  const queued = new Set(
    outbox
      .filter((entry) => entry.kind === "session.command")
      .map((entry) => (entry.kind === "session.command" ? entry.sessionId : "")),
  )
  let count = 0
  const remoteIds = new Set(remote.map((session) => session.id))
  for (const session of remote) {
    if (queued.has(session.id)) continue
    const local = await database.session(session.id)
    if (local !== undefined && !acceptsRemoteRevision(local.revision, session.revision)) continue
    await database.putSession(session)
    count += 1
  }
  for (const local of await database.sessions()) {
    if (remoteIds.has(local.id) || queued.has(local.id)) continue
    await database.removeSession(local.id)
    count += 1
  }
  return {
    count,
    offline: false,
    authRequired: false,
    remote: new Map(remote.map((entry) => [entry.id, entry])),
  }
}

function pullFailure<T>(cause: unknown): DomainPull<T> {
  const error = cause instanceof RpcError ? cause : new RpcError(String(cause), false)
  return {
    count: 0,
    offline: error.retryable,
    authRequired: error.auth,
    ...(error.retryable || error.auth ? {} : { failure: error.message }),
  }
}

/// Client to server. Drains the queue in the order the person acted.
async function drain(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  remote: RemoteAlbums | undefined,
  remoteSessions: RemoteSessions | undefined,
): Promise<Omit<SyncReport, "pulled">> {
  const entries = await database.outbox()
  const conflicts: ConflictReport[] = []
  const dropped: { id: string; reason: string }[] = []
  let pushed = 0
  let converged = 0
  let deferred = 0
  let offline = false
  let authRequired = false

  const listens = entries.filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "listen.append" }> =>
      entry.kind === "listen.append",
  )
  const placements = entries.filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "album.placement" }> =>
      entry.kind === "album.placement",
  )
  const sessionCommands = entries.filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "session.command" }> =>
      entry.kind === "session.command",
  )

  if (remote === undefined) {
    deferred += placements.length
  } else {
    for (const [index, entry] of placements.entries()) {
      const result = await pushPlacement(database, rpc, entry, remote, conflicts)
      if (result.outcome === "pushed") pushed += 1
      if (result.outcome === "converged" || result.outcome === "conflicted") converged += 1
      if (result.outcome === "deferred") {
        deferred += placements.length - index
        if (result.reason === "auth") authRequired = true
        else offline = true
        // Stop at the first unreachable write. Later writes for the same album must not be
        // applied out of order.
        break
      }
      if (result.outcome === "dropped") {
        dropped.push({ id: entry.id, reason: result.reason ?? "rejected by the server" })
      }
    }
  }

  if (remoteSessions === undefined) deferred += sessionCommands.length
  if (!authRequired && remoteSessions !== undefined) {
    for (const [index, entry] of sessionCommands.entries()) {
      const result = await pushSessionCommand(database, rpc, entry, remoteSessions)
      if (result.outcome === "pushed" || result.outcome === "converged") pushed += 1
      if (result.outcome === "deferred") {
        deferred += sessionCommands.length - index
        if (result.reason === "auth") authRequired = true
        else offline = true
        break
      }
      if (result.outcome === "dropped") {
        dropped.push({ id: entry.id, reason: result.reason ?? "rejected by the server" })
      }
    }
  } else if (authRequired) {
    deferred += sessionCommands.length
  }

  if (listens.length > 0 && !authRequired) {
    const submission = await submitListens(
      rpc,
      listens.map((entry) => ({ id: entry.id, event: entry.event })),
    )
    for (const id of submission.accepted) {
      await database.dequeue(id)
      pushed += 1
    }
    for (const rejection of submission.rejected) {
      await persistNotice(database, {
        id: `dropped:${rejection.id}`,
        kind: "dropped",
        writeId: rejection.id,
        reason: rejection.reason,
      })
      await database.dequeue(rejection.id)
      dropped.push(rejection)
    }
    deferred += submission.deferred.length
    if (submission.authRequired) authRequired = true
    else if (submission.deferred.length > 0) offline = true
  } else if (listens.length > 0) {
    deferred += listens.length
  }

  return { pushed, converged, dropped, deferred, conflicts, offline, authRequired }
}

async function pushSessionCommand(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  entry: Extract<WorkerOutboxEntry, { kind: "session.command" }>,
  sessions: RemoteSessions,
): Promise<{ outcome: OutboxResult; reason?: string }> {
  const remote = sessions.get(entry.sessionId)
  if (remote === undefined) {
    await persistNotice(database, {
      id: `dropped:${entry.id}`,
      kind: "dropped",
      writeId: entry.id,
      reason: "session no longer exists",
    })
    await database.removeSession(entry.sessionId)
    await database.dequeue(entry.id)
    return { outcome: "dropped", reason: "session no longer exists" }
  }

  // A crash can leave the outbox entry after the optimistic session write but before its
  // local receipt. Repair that receipt before network success removes the only remaining
  // evidence, or a later directive redelivery could repeat renderer effects. Storage
  // uncertainty can never make a precious command disposable.
  try {
    const local = (await database.session(entry.sessionId)) ?? remote
    await database.queueSessionCommand(local, entry.command, entry.commandId)
  } catch (cause) {
    await database.recordAttempt(
      entry.id,
      cause instanceof Error ? cause.message : "local receipt repair failed",
    )
    return { outcome: "deferred", reason: "local receipt repair failed" }
  }

  try {
    const updated = await rpc.runSessionCommand(entry.sessionId, entry.command, entry.commandId)
    if (updated === undefined) {
      await persistNotice(database, {
        id: `dropped:${entry.id}`,
        kind: "dropped",
        writeId: entry.id,
        reason: "session no longer exists",
      })
      await database.removeSession(entry.sessionId)
      await database.dequeue(entry.id)
      sessions.delete(entry.sessionId)
      return { outcome: "dropped", reason: "session no longer exists" }
    }
    sessions.set(updated.id, updated)
    await putServerSession(database, updated, entry.id)
    await database.dequeue(entry.id)
    return { outcome: "pushed" }
  } catch (cause) {
    const error = cause instanceof RpcError ? cause : new RpcError(String(cause), false)
    if (error.auth) return { outcome: "deferred", reason: "auth" }
    await database.recordAttempt(entry.id, error.message)
    if (!error.retryable) {
      await persistNotice(database, {
        id: `dropped:${entry.id}`,
        kind: "dropped",
        writeId: entry.id,
        reason: error.message,
      })
      await putServerSession(database, remote, entry.id)
      await database.dequeue(entry.id)
      return { outcome: "dropped", reason: error.message }
    }
    return { outcome: "deferred" }
  }
}

async function pushPlacement(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  entry: Extract<WorkerOutboxEntry, { kind: "album.placement" }>,
  albums: RemoteAlbums,
  conflicts: ConflictReport[],
): Promise<{ outcome: OutboxResult; reason?: string }> {
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

  if (decision.action === "converged") {
    if (remote !== undefined) await putServerAlbum(database, remote, entry.id)
    await database.dequeue(entry.id)
    return { outcome: "converged" }
  }

  if (decision.action === "remove") {
    await persistNotice(database, {
      id: `conflict:${entry.id}`,
      kind: "conflict",
      albumId: entry.albumId,
      kept: "removed",
      discarded: decision.discarded,
    })
    await database.removeAlbum(entry.albumId)
    await database.dequeue(entry.id)
    conflicts.push({
      albumId: entry.albumId,
      kept: "removed",
      discarded: decision.discarded,
    })
    return { outcome: "conflicted" }
  }

  if (decision.action === "keepRemote") {
    // The local row still shows the intent that just lost. Put the server's answer back so
    // the person sees what actually happened rather than a change that never landed.
    if (remote !== undefined) {
      await putServerAlbum(database, remote, entry.id)
      albums.set(remote.id, remote)
    }
    await persistNotice(database, {
      id: `conflict:${entry.id}`,
      kind: "conflict",
      albumId: entry.albumId,
      kept: (remote?.placement ?? entry.placement) as RpcPlacement,
      discarded: decision.discarded,
    })
    await database.dequeue(entry.id)
    conflicts.push({
      albumId: entry.albumId,
      kept: (remote?.placement ?? entry.placement) as RpcPlacement,
      discarded: decision.discarded,
    })
    return { outcome: "conflicted" }
  }

  try {
    const updated = await rpc.setPlacement(entry.albumId, entry.placement)
    if (updated === undefined) {
      await persistNotice(database, {
        id: `conflict:${entry.id}`,
        kind: "conflict",
        albumId: entry.albumId,
        kept: "removed",
        discarded: entry.placement,
      })
      await database.removeAlbum(entry.albumId)
      await database.dequeue(entry.id)
      albums.delete(entry.albumId)
      conflicts.push({
        albumId: entry.albumId,
        kept: "removed",
        discarded: entry.placement,
      })
      return { outcome: "conflicted" }
    }
    await putServerAlbum(database, updated, entry.id)
    if (decision.conflict) {
      await persistNotice(database, {
        id: `conflict:${entry.id}`,
        kind: "conflict",
        albumId: entry.albumId,
        kept: entry.placement,
        discarded: decision.discarded,
      })
    }
    await database.dequeue(entry.id)
    // Keep the server view current so the next queued write for this album is resolved
    // against what the server now holds.
    albums.set(updated.id, updated)
    if (decision.conflict) {
      conflicts.push({
        albumId: entry.albumId,
        kept: entry.placement,
        discarded: decision.discarded,
      })
      return { outcome: "conflicted" }
    }
    return { outcome: "pushed" }
  } catch (cause) {
    const error = cause instanceof RpcError ? cause : new RpcError(String(cause), false)
    if (error.auth) {
      // Nothing about repeating this helps until the credentials change, and dropping it
      // would lose the person's edit because a token expired. Leave it untouched.
      return { outcome: "deferred", reason: "auth" }
    }
    await database.recordAttempt(entry.id, error.message)
    if (!error.retryable) {
      await persistNotice(database, {
        id: `dropped:${entry.id}`,
        kind: "dropped",
        writeId: entry.id,
        reason: error.message,
      })
      // The server refused this change, so the local row still shows an intent that never
      // landed. Put the server's answer back rather than leaving the device diverged with
      // no way to notice.
      if (remote !== undefined) await putServerAlbum(database, remote, entry.id)
      await database.dequeue(entry.id)
      return { outcome: "dropped", reason: error.message }
    }
    return { outcome: "deferred" }
  }
}

/// Store server metadata without hiding a later local placement that is still queued.
async function persistNotice(database: WorkerDatabase, notice: WorkerSyncNotice): Promise<void> {
  const settings = await database.settings()
  const current = settings.syncNotices ?? []
  if (current.some((entry) => entry.id === notice.id)) return
  await database.writeSettings({ syncNotices: [...current, notice].slice(-100) })
}

async function putServerSession(
  database: WorkerDatabase,
  session: RpcSession,
  excludeId?: string,
): Promise<void> {
  const pending = (await database.outbox()).filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "session.command" }> =>
      entry.kind === "session.command" && entry.sessionId === session.id && entry.id !== excludeId,
  )
  let visible = session
  for (const entry of pending) {
    try {
      visible = applySessionCommand(visible, entry.command, visible.updatedAt)
    } catch {
      // The server will return the typed rejection when this entry reaches the front. Do
      // not let one invalid later command hide the earlier command that just succeeded.
      break
    }
  }
  await database.replaceSession(visible)
}

async function putServerAlbum(
  database: WorkerDatabase,
  album: RpcLibraryAlbum,
  excludeId?: string,
): Promise<void> {
  const pending = (await database.outbox()).filter(
    (entry): entry is Extract<WorkerOutboxEntry, { kind: "album.placement" }> =>
      entry.kind === "album.placement" && entry.albumId === album.id && entry.id !== excludeId,
  )
  await database.replaceAlbum({
    ...album,
    id: album.id,
    placement: pending.at(-1)?.placement ?? album.placement,
  })
}
