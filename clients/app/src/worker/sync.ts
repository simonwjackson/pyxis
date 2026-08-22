/// Two-way sync.
///
/// Order matters and is deliberate: pull first, then push. Pushing blind would send a
/// change based on state the server left behind long ago, and the conflict rules need to
/// know what the server currently holds before they can tell a replay from a real clash.
///
/// Nothing here decides a merge. `conflict.ts` owns every rule, so the policy can be read
/// and argued with in one place.

import type { RpcLibraryAlbum, RpcPlacement } from "../../../../contracts/generated/pyxis"

/// The server's own view, kept current as writes land.
///
/// It must be updated as the queue drains. Resolving the second write for an album against
/// the state before the first one landed makes that write look like a replay, and it is
/// then dropped without ever being sent.
type RemoteAlbums = Map<string, RpcLibraryAlbum>

import { RpcError, type WorkerRpc } from "../rpc/client"
import { acceptsRemoteRevision, resolvePlacement } from "./conflict"
import type { OutboxResult, WorkerDatabase, WorkerOutboxEntry } from "./contract"
import { submitListens } from "./listen-sync"

/// After this many failed attempts a queued write is treated as poison and dropped, with a
/// report. Keeping it forever would block everything behind it in the queue.
export const MAX_ATTEMPTS = 5

export interface ConflictReport {
  readonly albumId: string
  readonly kept: RpcPlacement
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
}

export async function sync(database: WorkerDatabase, rpc: WorkerRpc): Promise<SyncReport> {
  const pulled = await pull(database, rpc)
  if (pulled.offline || pulled.authRequired || pulled.failure !== undefined) {
    // Without knowing what the server currently holds, a push cannot tell a replay from a
    // conflict. Everything stays queued rather than being resolved against a guess.
    //
    // A permanent pull failure is reported rather than thrown. Throwing would leave the
    // caller with no report at all, and the queue silently stuck behind it.
    const queued = await database.outbox()
    return {
      pulled: pulled.count,
      pushed: 0,
      converged: 0,
      dropped: [],
      deferred: queued.length,
      conflicts: [],
      offline: pulled.offline,
      authRequired: pulled.authRequired,
      ...(pulled.failure === undefined ? {} : { failure: pulled.failure }),
    }
  }
  const push = await drain(database, rpc, pulled.remote)
  return { ...push, pulled: pulled.count }
}

/// Server to client. The server wins, but only where it is actually newer.
async function pull(
  database: WorkerDatabase,
  rpc: WorkerRpc,
): Promise<{
  count: number
  offline: boolean
  authRequired: boolean
  failure?: string
  remote: RemoteAlbums
}> {
  let remote: readonly Awaited<ReturnType<WorkerRpc["listAlbums"]>>[number][]
  try {
    remote = await rpc.listAlbums()
  } catch (cause) {
    const error = cause instanceof RpcError ? cause : new RpcError(String(cause), false)
    return {
      count: 0,
      offline: error.retryable,
      authRequired: error.auth,
      ...(error.retryable || error.auth ? {} : { failure: error.message }),
      remote: new Map(),
    }
  }

  // An album with a queued local write is not overwritten by the pull. The write has not
  // been resolved yet, and the person's most recent intent is what should be on screen.
  const queued = new Set(
    (await database.outbox())
      .filter((entry) => entry.kind === "album.placement")
      .map((entry) => (entry.kind === "album.placement" ? entry.albumId : "")),
  )

  let count = 0
  for (const album of remote) {
    if (queued.has(album.id)) continue
    const local = await database.album(album.id)
    if (local !== undefined && !acceptsRemoteRevision(local.revision, album.revision)) continue
    await database.putAlbum({ ...album, id: album.id })
    count += 1
  }
  // The server's own view, kept separately. Local rows carry unsent intent, so they cannot
  // answer what the server currently holds.
  return {
    count,
    offline: false,
    authRequired: false,
    remote: new Map(remote.map((entry) => [entry.id, entry])),
  }
}

/// Client to server. Drains the queue in the order the person acted.
async function drain(
  database: WorkerDatabase,
  rpc: WorkerRpc,
  remote: RemoteAlbums,
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

  for (const entry of placements) {
    const result = await pushPlacement(database, rpc, entry, remote, conflicts)
    if (result.outcome === "pushed") pushed += 1
    if (result.outcome === "converged" || result.outcome === "conflicted") converged += 1
    if (result.outcome === "deferred") {
      deferred += 1
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

  if (listens.length > 0 && !offline) {
    const submission = await submitListens(
      rpc,
      listens.map((entry) => ({ id: entry.id, event: entry.event })),
    )
    for (const id of submission.accepted) {
      await database.dequeue(id)
      pushed += 1
    }
    for (const rejection of submission.rejected) {
      await database.dequeue(rejection.id)
      dropped.push(rejection)
    }
    deferred += submission.deferred.length
    if (submission.deferred.length > 0) offline = true
  } else if (listens.length > 0) {
    deferred += listens.length
  }

  return { pushed, converged, dropped, deferred, conflicts, offline, authRequired }
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
    await database.dequeue(entry.id)
    return { outcome: "converged" }
  }

  if (decision.action === "keepRemote") {
    await database.dequeue(entry.id)
    // The local row still shows the intent that just lost. Put the server's answer back so
    // the person sees what actually happened rather than a change that never landed.
    if (remote !== undefined) {
      await database.putAlbum({ ...remote, id: remote.id })
      albums.set(remote.id, remote)
    }
    conflicts.push({
      albumId: entry.albumId,
      kept: (remote?.placement ?? entry.placement) as RpcPlacement,
      discarded: decision.discarded,
    })
    return { outcome: "conflicted" }
  }

  try {
    const updated = await rpc.setPlacement(entry.albumId, entry.placement)
    await database.dequeue(entry.id)
    if (updated !== undefined) {
      await database.putAlbum({ ...updated, id: updated.id })
      // Keep the server view current so the next queued write for this album is resolved
      // against what the server now holds.
      albums.set(updated.id, updated)
    }
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
    if (!error.retryable || entry.attempts + 1 >= MAX_ATTEMPTS) {
      await database.dequeue(entry.id)
      // The server refused this change, so the local row still shows an intent that never
      // landed. Put the server's answer back rather than leaving the device diverged with
      // no way to notice.
      if (remote !== undefined) await database.putAlbum({ ...remote, id: remote.id })
      return { outcome: "dropped", reason: error.message }
    }
    return { outcome: "deferred" }
  }
}
