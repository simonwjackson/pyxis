import type {
  WorkerDatabase,
  WorkerOutboxEntry,
  WorkerOutboxVerdict,
  WorkerSettlementAction,
  WorkerSettlementResult,
  WorkerSettlementSnapshot,
  WorkerSyncNotice,
} from "./contract"

/// This runs on the concrete database inside one refreshed account lock. Each awaited
/// write is durable before the next starts. A transaction cannot order separate files.
export async function settleOutbox(
  database: WorkerDatabase,
  id: string,
  action: WorkerSettlementAction,
): Promise<WorkerSettlementResult> {
  let entry: WorkerOutboxEntry | undefined
  try {
    entry = (await database.outbox()).find((row) => row.id === id)
    if (entry === undefined) return { outcome: "absent" }
    if (action._tag === "Defer") {
      if (action.cause !== "auth") await database.recordAttempt(id, action.reason)
      return {
        outcome: "deferred",
        reason: action.cause,
        ...(action.cause === "storage" ? { failure: action.reason } : {}),
      }
    }

    const verdict = entry.settlement ?? (action._tag === "Settle" ? action.verdict : undefined)
    if (verdict === undefined) throw new Error("queued write has no settlement to resume")
    validateVerdict(entry, verdict)
    // Keep the original verdict when a retry sees changed server state. In particular,
    // placement convergence cannot erase an earlier conflict whose notice failed to save.
    entry = { ...entry, settlement: verdict }
    await database.enqueue(entry)
    const result = await applyVerdict(
      database,
      entry,
      verdict,
      action._tag === "Resume" ? action.latest : undefined,
    )
    if (result.outcome === "conflicted" || result.outcome === "dropped")
      await appendNotice(database, result.notice)
    await database.dequeue(id)
    return result
  } catch (cause) {
    const failure = cause instanceof Error ? cause.message : String(cause)
    if (entry !== undefined) {
      // A failed attempt write is also uncertain. Never roll back acceptance or delete the
      // original intent to make a storage error disappear. The next lock reopens the store.
      await database
        .enqueue({
          ...entry,
          attempts: entry.attempts + 1,
          lastError: failure,
        })
        .catch(() => undefined)
    }
    return { outcome: "deferred", reason: "storage", failure }
  }
}

function validateVerdict(entry: WorkerOutboxEntry, verdict: WorkerOutboxVerdict): void {
  if (verdict._tag === "SessionAccepted") {
    if (entry.kind === "session.command" && entry.sessionId === verdict.session.id) return
  } else if (
    verdict._tag === "PlacementAccepted" ||
    verdict._tag === "PlacementConverged" ||
    verdict._tag === "PlacementConflict"
  ) {
    if (entry.kind === "album.placement" && entry.albumId === verdict.album.id) return
  } else if (verdict._tag === "ListenAccepted") {
    if (entry.kind === "listen.append") return
  } else if (verdict._tag === "Removed") {
    if (entry.kind !== "listen.append") return
  } else {
    if (verdict.restore === undefined) return
    const restore = verdict.restore
    if (
      restore._tag === "Session" &&
      entry.kind === "session.command" &&
      restore.session.id === entry.sessionId
    )
      return
    if (
      restore._tag === "Placement" &&
      entry.kind === "album.placement" &&
      restore.album.id === entry.albumId
    )
      return
  }
  throw new Error("settlement does not belong to this queued write")
}

async function applyVerdict(
  database: WorkerDatabase,
  entry: WorkerOutboxEntry,
  verdict: WorkerOutboxVerdict,
  latest?: WorkerSettlementSnapshot,
): Promise<WorkerSettlementResult> {
  switch (verdict._tag) {
    case "SessionAccepted":
      await applySnapshot(database, entry, { _tag: "Session", session: verdict.session }, latest)
      return { outcome: "pushed" }
    case "PlacementAccepted":
      await applySnapshot(database, entry, { _tag: "Placement", album: verdict.album }, latest)
      return { outcome: "pushed" }
    case "PlacementConverged":
      await applySnapshot(database, entry, { _tag: "Placement", album: verdict.album }, latest)
      return { outcome: "converged" }
    case "PlacementConflict":
      await applySnapshot(database, entry, { _tag: "Placement", album: verdict.album }, latest)
      return {
        outcome: "conflicted",
        notice: {
          id: `conflict:${entry.id}`,
          kind: "conflict",
          albumId: verdict.album.id,
          kept: verdict.album.placement,
          discarded: verdict.discarded,
        },
      }
    case "ListenAccepted":
      return { outcome: "pushed" }
    case "Removed":
      if (entry.kind === "album.placement") {
        await database.removeAlbum(entry.albumId)
        return {
          outcome: "conflicted",
          notice: {
            id: `conflict:${entry.id}`,
            kind: "conflict",
            albumId: entry.albumId,
            kept: "removed",
            discarded: entry.placement,
          },
        }
      }
      if (entry.kind === "session.command") await database.removeSession(entry.sessionId)
      return rejection(entry.id, "session no longer exists")
    case "Rejected":
      if (verdict.restore !== undefined)
        await applySnapshot(database, entry, verdict.restore, latest)
      return rejection(entry.id, verdict.reason)
  }
}

async function applySnapshot(
  database: WorkerDatabase,
  entry: WorkerOutboxEntry,
  saved: Exclude<WorkerSettlementSnapshot, { _tag: "Removed" }>,
  latest?: WorkerSettlementSnapshot,
): Promise<void> {
  // A resumed verdict is historical evidence, not permission to undo a later server
  // revision or recreate an entity removed since acceptance. Its notice stays historical.
  if (latest?._tag === "Removed") {
    if (entry.kind === "session.command") await database.removeSession(entry.sessionId)
    else if (entry.kind === "album.placement") await database.removeAlbum(entry.albumId)
    return
  }
  // Other durable verdicts can be newer even when the pull is unavailable. They are
  // authoritative facts, not pending intent to replay on top of another accepted result.
  for (const queued of await database.outbox()) {
    const sameEntity =
      (entry.kind === "session.command" &&
        queued.kind === "session.command" &&
        entry.sessionId === queued.sessionId) ||
      (entry.kind === "album.placement" &&
        queued.kind === "album.placement" &&
        entry.albumId === queued.albumId)
    if (!sameEntity || queued.settlement === undefined) continue
    validateVerdict(queued, queued.settlement)
    if (queued.settlement._tag === "Removed") {
      if (entry.kind === "session.command") await database.removeSession(entry.sessionId)
      else if (entry.kind === "album.placement") await database.removeAlbum(entry.albumId)
      return
    }
    const recorded = verdictSnapshot(queued.settlement)
    if (
      recorded._tag === "Session" &&
      saved._tag === "Session" &&
      recorded.session.revision > saved.session.revision
    )
      saved = recorded
    else if (
      recorded._tag === "Placement" &&
      saved._tag === "Placement" &&
      recorded.album.revision > saved.album.revision
    )
      saved = recorded
  }
  if (saved._tag === "Session") {
    const current =
      latest?._tag === "Session" &&
      latest.session.id === saved.session.id &&
      latest.session.revision >= saved.session.revision
        ? latest.session
        : saved.session
    await database.applySessionVerdict(current, entry.id)
  } else {
    const current =
      latest?._tag === "Placement" &&
      latest.album.id === saved.album.id &&
      latest.album.revision >= saved.album.revision
        ? latest.album
        : saved.album
    await database.applyPlacementVerdict(current, entry.id)
  }
}

function verdictSnapshot(
  verdict: WorkerOutboxVerdict,
): Exclude<WorkerSettlementSnapshot, { _tag: "Removed" }> | { readonly _tag: "NoProjection" } {
  switch (verdict._tag) {
    case "SessionAccepted":
      return { _tag: "Session", session: verdict.session }
    case "PlacementAccepted":
    case "PlacementConverged":
    case "PlacementConflict":
      return { _tag: "Placement", album: verdict.album }
    case "Rejected":
      return verdict.restore ?? { _tag: "NoProjection" }
    case "ListenAccepted":
    case "Removed":
      return { _tag: "NoProjection" }
  }
}

function rejection(id: string, reason: string): WorkerSettlementResult {
  return {
    outcome: "dropped",
    reason,
    notice: { id: `dropped:${id}`, kind: "dropped", writeId: id, reason },
  }
}

async function appendNotice(database: WorkerDatabase, notice: WorkerSyncNotice): Promise<void> {
  const settings = await database.settings()
  const current = settings.syncNotices ?? []
  if (current.some((row) => row.id === notice.id)) return
  await database.writeSettings({ syncNotices: [...current, notice].slice(-100) })
}
