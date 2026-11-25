/// Local database behind the worker boundary.
///
/// Opening is the interesting part. A store that is corrupt, or that belongs to a newer
/// build, is discarded and reported rather than half-read. A client that silently renders
/// half a database is worse than one that refetches.

import { Option } from "effect"
import { monotonicFactory } from "ulid"
import type { RpcSessionCommand } from "../../../../contracts/generated/pyxis"
import { type ListenEventInput, listenEventId } from "../rpc/client"
import {
  type OfflineMedia,
  type OfflinePin,
  SCHEMA_ROW_ID,
  SESSION_CHANGED_DURING_CONFIRMATION,
  SETTINGS_ROW_ID,
  type StoredWorkerSession,
  WORKER_MIGRATIONS,
  WORKER_SCHEMA_VERSION,
  type WorkerAlbum,
  type WorkerCollection,
  type WorkerCollections,
  type WorkerDatabase,
  type WorkerEngine,
  type WorkerMigrations,
  type WorkerOpenReason,
  type WorkerOpenReport,
  type WorkerOutboxEntry,
  type WorkerSession,
  type WorkerSessionCommandPreview,
  type WorkerSessionEventResult,
  type WorkerSettings,
  type WorkerSettlementAction,
  type WorkerSettlementResult,
} from "./contract"
import { hasRetiredSessionIntent } from "./retired-session-intent"
import { applySessionCommand, normalizeSessionModes } from "./session-local"
import { SessionRows } from "./session-rows"
import { settleOutbox } from "./sync-settlement"

const nextOutboxId = monotonicFactory()

export interface OpenOptions {
  readonly engine: WorkerEngine
  readonly version?: number
  readonly migrations?: WorkerMigrations
  /// Called when existing data had to be discarded, so the caller can refetch.
  readonly onReset?: (cause: unknown) => void
  /// Wipes every collection. Supplied by the storage host, because only it knows how.
  readonly clear?: () => Promise<void>
}

export async function openWorkerDatabase(options: OpenOptions): Promise<WorkerDatabase> {
  const version = options.version ?? WORKER_SCHEMA_VERSION
  const migrations = options.migrations ?? WORKER_MIGRATIONS
  const engine = options.engine

  let reason: WorkerOpenReason
  let fromVersion: number | undefined

  try {
    const stored = await engine.meta.findById(SCHEMA_ROW_ID)
    fromVersion = stored?.version

    if (stored === undefined) {
      reason = (await isEmpty(engine)) ? "created" : "reset"
      if (reason === "reset") {
        // Data with no version row cannot be interpreted safely.
        await discard(options, new Error("local database has data but no schema version"))
      }
      await engine.meta.upsert({ id: SCHEMA_ROW_ID, version })
    } else if (stored.version > version) {
      // Written by a newer build. Guessing at a shape from the future is how data gets
      // silently mangled, so start clean and refetch.
      await discard(
        options,
        new Error(`local database is version ${stored.version}, newer than ${version}`),
      )
      await engine.meta.upsert({ id: SCHEMA_ROW_ID, version })
      reason = "reset"
    } else if (stored.version < version) {
      await migrate(engine, stored.version, version, migrations)
      await engine.meta.upsert({ id: SCHEMA_ROW_ID, version })
      reason = "migrated"
    } else {
      reason = "opened"
    }
  } catch (cause) {
    // Recovery itself can fail: a quota-exhausted or unavailable IndexedDB cannot be
    // cleared or stamped either. Falling back to memory keeps the client usable rather
    // than turning a storage problem into a blank page.
    try {
      await discard(options, cause)
      await engine.meta.upsert({ id: SCHEMA_ROW_ID, version })
      reason = "reset"
    } catch (fatal) {
      try {
        options.onReset?.(fatal)
      } catch {
        // Reporting must never be the reason opening fails.
      }
      const memory = createMemoryEngine()
      await memory.meta.upsert({ id: SCHEMA_ROW_ID, version })
      return new LocalWorkerDatabase(memory, {
        reason: "reset",
        ...(fromVersion === undefined ? {} : { fromVersion }),
        version,
        ephemeral: true,
      })
    }
  }

  const report: WorkerOpenReport = {
    reason,
    ...(fromVersion === undefined ? {} : { fromVersion }),
    version,
  }
  return new LocalWorkerDatabase(engine, report)
}

async function migrate(
  engine: WorkerEngine,
  from: number,
  to: number,
  migrations: WorkerMigrations,
): Promise<void> {
  for (let step = from + 1; step <= to; step += 1) {
    const migration = migrations[step]
    if (migration === undefined) {
      // A gap means this build cannot honestly move the data forward.
      throw new Error(`no migration to schema version ${step}`)
    }
    await migration(engine)
  }
}

async function isEmpty(engine: WorkerEngine): Promise<boolean> {
  const [
    settings,
    albums,
    sessions,
    retiredSessions,
    offlinePins,
    offlineMedia,
    commandReceipts,
    outbox,
  ] = await Promise.all([
    engine.settings.all(),
    engine.albums.all(),
    engine.sessions.all(),
    engine.retiredSessions.all(),
    engine.offlinePins.all(),
    engine.offlineMedia.all(),
    engine.commandReceipts.all(),
    engine.outbox.all(),
  ])
  return (
    settings.length === 0 &&
    albums.length === 0 &&
    sessions.length === 0 &&
    retiredSessions.length === 0 &&
    offlinePins.length === 0 &&
    offlineMedia.length === 0 &&
    commandReceipts.length === 0 &&
    outbox.length === 0
  )
}

async function discard(options: OpenOptions, cause: unknown): Promise<void> {
  options.onReset?.(cause)
  if (options.clear !== undefined) {
    await options.clear()
    return
  }
  await clearCollections(options.engine)
}

async function clearCollections(engine: WorkerEngine): Promise<void> {
  for (const collection of [
    engine.meta,
    engine.settings,
    engine.albums,
    engine.sessions,
    engine.retiredSessions,
    engine.offlinePins,
    engine.offlineMedia,
    engine.commandReceipts,
    engine.outbox,
  ]) {
    const rows = await collection.all()
    for (const row of rows) await collection.delete(row.id)
  }
}

type TimerAuthority = NonNullable<StoredWorkerSession["timerAuthority"]>
function publicSession({
  timerAuthority: _private,
  ...session
}: StoredWorkerSession): WorkerSession {
  return session
}
function authority(session: WorkerSession): TimerAuthority {
  return {
    revision: session.revision,
    ...(session.sleepTimer ? { sleepTimer: session.sleepTimer } : {}),
  }
}
function latestTimerAuthority(
  previous: TimerAuthority | undefined,
  session: WorkerSession,
): TimerAuthority {
  return previous && previous.revision > session.revision ? previous : authority(session)
}
function withTimer(session: WorkerSession, timer: WorkerSession["sleepTimer"]): WorkerSession {
  const { sleepTimer: _old, ...rest } = session
  return timer ? { ...rest, sleepTimer: timer } : rest
}

type PendingSessionCommand = Extract<WorkerOutboxEntry, { kind: "session.command" }>
function disarmedTimer(entry: PendingSessionCommand): string | undefined {
  return entry.command._tag === "transport.stop"
    ? (entry.command.payload.sleepTimerId ?? entry.clearedSleepTimerId)
    : undefined
}

// An outbox entry already passed validation when it was created. Replay playback intent,
// but never use an old Stop to consume a replacement timer (or stop its playback).
function replayPending(
  session: WorkerSession,
  entry: PendingSessionCommand,
  now?: string,
): WorkerSession {
  const { command } = entry
  if (
    command._tag === "transport.stop" &&
    command.payload.sleepTimerId !== undefined &&
    command.payload.sleepTimerId !== session.sleepTimer?.id
  )
    return session
  const next = applySessionCommand(session, command, now)
  return command._tag === "transport.stop" &&
    session.sleepTimer &&
    disarmedTimer(entry) !== session.sleepTimer.id
    ? withTimer(next, session.sleepTimer)
    : next
}

class LocalWorkerDatabase implements WorkerDatabase {
  private settingsMutation: Promise<void> = Promise.resolve()
  private settlementMutation: Promise<void> = Promise.resolve()

  private readonly sessionRows: SessionRows
  constructor(
    private readonly engine: WorkerEngine,
    readonly report: WorkerOpenReport,
  ) {
    this.sessionRows = new SessionRows(engine)
  }

  async settings(): Promise<WorkerSettings> {
    const stored = await this.engine.settings.findById(SETTINGS_ROW_ID)
    if (stored !== undefined) return stored
    // A device identity is minted once and never re-minted, because listen events and
    // session ownership are attributed to it.
    return this.engine.settings.upsert({ id: SETTINGS_ROW_ID, deviceId: mintDeviceId() })
  }

  async writeSettings(patch: Omit<Partial<WorkerSettings>, "id">): Promise<WorkerSettings> {
    const request = this.settingsMutation
      .catch(() => undefined)
      .then(() => this.writeSettingsNow(patch))
    this.settingsMutation = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }

  private async writeSettingsNow(
    patch: Omit<Partial<WorkerSettings>, "id">,
  ): Promise<WorkerSettings> {
    const current = await this.settings()
    const changesAccount =
      current.accountId !== undefined &&
      patch.accountId !== undefined &&
      current.accountId !== patch.accountId
    if (changesAccount) {
      if ((await this.engine.outbox.all()).length > 0) {
        throw new Error("cannot change account while queued writes still belong to it")
      }
      if (
        patch.accountName === undefined ||
        patch.accountIsDefault === undefined ||
        patch.accountCreatedAt === undefined ||
        patch.deviceId === undefined ||
        patch.deviceName === undefined ||
        patch.bearerToken === undefined
      ) {
        throw new Error("changing account requires a complete account grant")
      }
      for (const album of await this.engine.albums.all()) {
        await this.engine.albums.delete(album.id)
      }
      for (const session of await this.engine.sessions.all()) {
        await this.engine.sessions.delete(session.id)
      }
      for (const marker of await this.engine.retiredSessions.all())
        await this.engine.retiredSessions.delete(marker.id)
      for (const pin of await this.engine.offlinePins.all()) {
        await this.engine.offlinePins.delete(pin.id)
      }
      for (const media of await this.engine.offlineMedia.all()) {
        await this.engine.offlineMedia.delete(media.id)
      }
      for (const receipt of await this.engine.commandReceipts.all()) {
        await this.engine.commandReceipts.delete(receipt.id)
      }
      // A realtime cursor is scoped to the old account and cannot cross the boundary.
      const {
        resumeToken: _resumeToken,
        sessionListToken: _sessionListToken,
        syncNotices: _syncNotices,
        ...withoutAccountLocalState
      } = current
      // ProseQL upsert patches optional fields. Delete first so omitted account-local fields
      // cannot survive the switch.
      await this.engine.settings.delete(SETTINGS_ROW_ID)
      return this.engine.settings.upsert({
        ...withoutAccountLocalState,
        ...patch,
        id: SETTINGS_ROW_ID,
      })
    }
    return this.engine.settings.upsert({ ...current, ...patch, id: SETTINGS_ROW_ID })
  }

  async albums(): Promise<readonly WorkerAlbum[]> {
    return this.engine.albums.all()
  }

  async album(id: string): Promise<WorkerAlbum | undefined> {
    return this.engine.albums.findById(id)
  }

  async applyRemoteAlbums(albums: readonly WorkerAlbum[]): Promise<number> {
    const applied = await this.engine.batch(async (engine) => {
      const existing = await engine.albums.all()
      const localById = new Map(existing.map((album) => [album.id, album]))
      const remoteIds = new Set(albums.map((album) => album.id))
      const changed: WorkerAlbum[] = []
      let count = 0

      for (const album of albums) {
        const local = localById.get(album.id)
        if (local !== undefined && album.revision <= local.revision) continue
        // Preserve sequential duplicate-ID handling: a later older row cannot undo an
        // earlier newer row, while equal-revision duplicates keep their original order.
        const current = await engine.albums.findById(album.id)
        changed.push(
          current !== undefined && current.revision > album.revision
            ? current
            : await engine.albums.upsert(album),
        )
        count += 1
      }
      for (const local of existing) {
        if (remoteIds.has(local.id)) continue
        await engine.albums.delete(local.id)
        count += 1
      }
      return { count, changed }
    })
    // The outer worker Web Lock still spans both batches. Commit albums first: a rejected
    // album file must not unpin the old library. Separate relationship files can still fail
    // afterward, so repair retained truth on retries even when revisions are unchanged.
    await this.engine.batch(async (engine) => {
      for (const album of applied.changed) await this.reconcileOfflineAlbumTracks(engine, album)
      await this.reconcileOfflineAlbums(engine)
    })
    return applied.count
  }

  async replaceAlbums(albums: readonly WorkerAlbum[]): Promise<void> {
    const incoming = new Map(albums.map((album) => [album.id, album]))
    const existing = await this.engine.albums.all()
    for (const album of existing) {
      if (!incoming.has(album.id)) await this.removeAlbum(album.id)
    }
    for (const album of albums) await this.replaceAlbum(album)
  }

  private async reconcileOfflineAlbums(engine: WorkerCollections): Promise<void> {
    const [albums, pins, media] = await Promise.all([
      engine.albums.all(),
      engine.offlinePins.all(),
      engine.offlineMedia.all(),
    ])
    const tracksByAlbum = new Map(
      albums.map((album) => [album.id, new Set(album.tracks.map((track) => track.id))]),
    )
    for (const pin of pins) {
      if (tracksByAlbum.has(pin.albumId)) continue
      if (pin.pinned === false && pin.lastError === undefined) continue
      const { lastError: _lastError, ...withoutError } = pin
      await engine.offlinePins.upsert({
        ...withoutError,
        generation: pin.generation + (pin.pinned === false ? 0 : 1),
        pinned: false,
      })
    }
    for (const entry of media) {
      const albumIds = entry.albumIds.filter((id) => tracksByAlbum.get(id)?.has(entry.trackId))
      if (albumIds.length !== entry.albumIds.length) {
        await engine.offlineMedia.upsert({ ...entry, albumIds })
      }
    }
  }

  private async reconcileOfflineAlbumTracks(
    engine: WorkerCollections,
    album: WorkerAlbum,
  ): Promise<void> {
    const trackIds = new Set(album.tracks.map((track) => track.id))
    for (const media of await engine.offlineMedia.all()) {
      if (!media.albumIds.includes(album.id) || trackIds.has(media.trackId)) continue
      await engine.offlineMedia.upsert({
        ...media,
        albumIds: media.albumIds.filter((albumId) => albumId !== album.id),
      })
    }
  }

  async putAlbum(album: WorkerAlbum): Promise<WorkerAlbum> {
    const existing = await this.engine.albums.findById(album.id)
    // Local and remote writes arrive on independent channels with no ordering between
    // them, so the revision decides rather than arrival.
    if (existing !== undefined && existing.revision > album.revision) return existing
    const stored = await this.engine.albums.upsert(album)
    await this.reconcileOfflineAlbumTracks(this.engine, stored)
    return stored
  }

  async replaceAlbum(album: WorkerAlbum): Promise<WorkerAlbum> {
    const stored = await this.engine.albums.upsert(album)
    await this.reconcileOfflineAlbumTracks(this.engine, stored)
    return stored
  }

  async removeAlbum(id: string): Promise<boolean> {
    const removed = await this.engine.albums.delete(id)
    const pin = await this.engine.offlinePins.findById(id)
    if (pin !== undefined) {
      const { lastError: _lastError, ...withoutError } = pin
      await this.engine.offlinePins.upsert({
        ...withoutError,
        generation: pin.generation + 1,
        pinned: false,
      })
    }
    for (const media of await this.engine.offlineMedia.all()) {
      if (!media.albumIds.includes(id)) continue
      await this.engine.offlineMedia.upsert({
        ...media,
        albumIds: media.albumIds.filter((albumId) => albumId !== id),
      })
    }
    return removed
  }

  async sessions(): Promise<readonly WorkerSession[]> {
    return (await this.sessionRows.all()).map((row) => normalizeSessionModes(publicSession(row)))
  }

  async session(id: string): Promise<WorkerSession | undefined> {
    const stored = await this.sessionRows.get(id)
    return Option.getOrUndefined(
      Option.map(stored, (row) => normalizeSessionModes(publicSession(row))),
    )
  }

  // Reserve before sending the RPC. The token survives the refresh under the next
  // Web Lock. A concurrent list supersedes this one; a session event invalidates it.
  beginSessionList(): Promise<string> {
    return this.sessionRows.exclusive(async () => {
      const token = crypto.randomUUID()
      await this.writeSettings({ sessionListToken: token })
      return token
    })
  }
  private async sessionListToken(): Promise<string> {
    return (await this.engine.settings.findById(SETTINGS_ROW_ID))?.sessionListToken ?? ""
  }

  async applyRemoteSessions(
    sessions: readonly WorkerSession[],
    fence: string,
  ): Promise<number | "superseded"> {
    return this.sessionRows.exclusive(async () => {
      if (!fence || fence !== (await this.sessionListToken())) return "superseded"
      return this.applyList(sessions)
    })
  }
  private async applyList(sessions: readonly WorkerSession[]): Promise<number> {
    const [outbox, existing] = await Promise.all([this.engine.outbox.all(), this.sessionRows.all()])
    const queued = new Set(
      outbox
        .filter((entry) => entry.kind === "session.command")
        .map((entry) => (entry.kind === "session.command" ? entry.sessionId : "")),
    )
    const localById = new Map(existing.map((session) => [session.id, session]))
    const remoteIds = new Set(sessions.map((session) => session.id))
    let count = 0

    for (const session of sessions) {
      const local = localById.get(session.id)
      if (queued.has(session.id)) {
        if (await this.applyQueuedTimer(session, local, outbox)) count += 1
        continue
      }
      if (local !== undefined && session.revision < local.revision) continue
      // Reachability can change without a revision. Compare the whole snapshot too: an
      // older adapter may have deep-merged optional fields the server omitted. A current
      // authoritative pull repairs that stale body without a migration or touching outbox
      // intent (queued sessions were excluded above).
      if (
        local !== undefined &&
        session.revision === local.revision &&
        canonicalJson(session) === canonicalJson(publicSession(local))
      ) {
        continue
      }
      if (await this.sessionRows.retired(session.id)) continue
      await this.storeLiveSession(session, false)
      count += 1
    }
    for (const local of existing) {
      if (remoteIds.has(local.id)) continue
      await this.engine.sessions.delete(local.id)
      count += 1
    }
    return count
  }

  // Store the core watermark with the same atomic opaque body as the projection. A
  // delayed command verdict must not resurrect a deadline the worker already cancelled.
  private async applyQueuedTimer(
    remote: WorkerSession,
    local: StoredWorkerSession | undefined,
    outbox: readonly WorkerOutboxEntry[],
  ): Promise<WorkerSession | undefined> {
    if (!local || remote.hostDeviceId !== local.hostDeviceId) return undefined
    const pending = outbox.filter(
      (e): e is Extract<WorkerOutboxEntry, { kind: "session.command" }> =>
        e.kind === "session.command" && e.sessionId === local.id,
    )
    const revision = local.timerAuthority?.revision ?? pending[0]?.baseRevision ?? local.revision
    if (remote.revision <= revision) return undefined
    const stopped =
      remote.sleepTimer && pending.some((entry) => disarmedTimer(entry) === remote.sleepTimer?.id)
    const projected = withTimer(publicSession(local), stopped ? undefined : remote.sleepTimer)
    await this.storeSession(projected, authority(remote))
    return projected.sleepTimer?.id !== local.sleepTimer?.id ? projected : undefined
  }

  applyRemoteSession(session: WorkerSession): Promise<WorkerSessionEventResult> {
    return this.sessionRows.exclusive(async () => {
      await this.invalidateSessionList()
      return this.applyEvent(session)
    })
  }
  private async invalidateSessionList(): Promise<void> {
    if (await this.sessionListToken()) await this.writeSettings({ sessionListToken: "" })
  }
  private async applyEvent(session: WorkerSession): Promise<WorkerSessionEventResult> {
    if (await this.sessionRows.retired(session.id)) return { status: "retired" }
    const [stored, outbox] = await Promise.all([
      this.engine.sessions.findById(session.id),
      this.engine.outbox.all(),
    ])
    const local = stored && publicSession(stored)
    if (
      outbox.some((entry) => entry.kind === "session.command" && entry.sessionId === session.id)
    ) {
      // Do not call an ignored event durable: a delayed acknowledgement can replace the
      // local row after this returns. The caller retains and reapplies the event once the
      // outbox settles, before persisting its cursor.
      const timerProjection = await this.applyQueuedTimer(session, stored, outbox)
      return timerProjection ? { status: "queued", timerProjection } : { status: "queued" }
    }
    if (local !== undefined && session.revision < local.revision) {
      return { status: "applied", session: local }
    }
    if (local !== undefined && canonicalJson(session) === canonicalJson(local)) {
      return { status: "applied", session: local }
    }
    return { status: "applied", session: await this.storeLiveSession(session, false) }
  }

  private async storeSession(
    session: WorkerSession,
    timerAuthority: TimerAuthority,
  ): Promise<WorkerSession> {
    await this.engine.sessions.upsert({ ...session, timerAuthority })
    return session
  }

  putSession(session: WorkerSession): Promise<WorkerSession> {
    return this.sessionRows.exclusive(() => this.storeLiveSession(session, false))
  }
  replaceSession(session: WorkerSession): Promise<WorkerSession> {
    return this.sessionRows.exclusive(() => this.storeLiveSession(session, true))
  }
  private async storeLiveSession(session: WorkerSession, replace: boolean): Promise<WorkerSession> {
    if (await this.sessionRows.retired(session.id)) throw new Error("session is retired")
    const existing = await this.engine.sessions.findById(session.id)
    if (!replace && existing && existing.revision > session.revision) return publicSession(existing)
    const latest = latestTimerAuthority(existing?.timerAuthority, session)
    return this.storeSession(withTimer(session, latest.sleepTimer), latest)
  }

  applySessionVerdict(session: WorkerSession, writeId: string): Promise<WorkerSession | undefined> {
    return this.sessionRows.exclusive(() => this.applyVerdict(session, writeId))
  }
  private async applyVerdict(
    session: WorkerSession,
    writeId: string,
  ): Promise<WorkerSession | undefined> {
    if (await this.sessionRows.retired(session.id)) return undefined
    // Both the pending-command read and the replacement stay inside the caller's
    // account-fenced lock. A local command must run wholly before or after this operation,
    // never between them, or its optimistic result is overwritten while it stays queued.
    const pending = (await this.outbox()).filter(
      (entry): entry is Extract<WorkerOutboxEntry, { kind: "session.command" }> =>
        entry.kind === "session.command" &&
        entry.sessionId === session.id &&
        entry.id !== writeId &&
        entry.settlement === undefined,
    )
    const previous = (await this.engine.sessions.findById(session.id))?.timerAuthority
    const latest = latestTimerAuthority(previous, session)
    let visible = withTimer(session, latest.sleepTimer)
    const replayed: typeof pending = []
    for (const entry of pending) {
      if (hasRetiredSessionIntent(entry)) break
      try {
        visible = replayPending(visible, entry, visible.updatedAt)
        replayed.push(entry)
      } catch {
        // The server will return the typed rejection when this entry reaches the front. Do
        // not let one invalid later command hide the earlier command that just succeeded.
        break
      }
    }
    // Replaying changes result timestamps and fingerprints. Repair receipts before
    // publishing the changed projection, or receipt failure permits duplicate redelivery.
    // Settlement's durable journal repairs a projection failure after receipt persistence.
    for (const entry of replayed) {
      const id = `${session.id}:${entry.commandId}`
      const fingerprint = canonicalJson(entry.command)
      const receipt = await this.engine.commandReceipts.findById(id)
      if (receipt !== undefined && receipt.fingerprint !== fingerprint) {
        throw new Error(
          `command ID ${entry.commandId} already belongs to a different session command`,
        )
      }
      if (receipt === undefined) {
        await this.engine.commandReceipts.upsert({ id, sessionId: session.id, fingerprint })
      }
    }
    return this.storeSession(visible, latest)
  }

  async removeSession(id: string): Promise<boolean> {
    return this.sessionRows.exclusive(() => this.engine.sessions.delete(id))
  }
  applySessionRetirement(id: string): Promise<boolean> {
    return this.sessionRows.exclusive(async () => {
      await this.invalidateSessionList()
      return this.sessionRows.retire(id)
    })
  }

  async offlinePins(): Promise<readonly OfflinePin[]> {
    return this.engine.offlinePins.all()
  }

  async offlinePin(id: string): Promise<OfflinePin | undefined> {
    return this.engine.offlinePins.findById(id)
  }

  async putOfflinePin(pin: OfflinePin): Promise<OfflinePin> {
    return this.engine.offlinePins.upsert(pin)
  }

  async removeOfflinePin(id: string): Promise<boolean> {
    return this.engine.offlinePins.delete(id)
  }

  async offlineMedia(): Promise<readonly OfflineMedia[]> {
    return this.engine.offlineMedia.all()
  }

  async offlineMedium(trackId: string): Promise<OfflineMedia | undefined> {
    return this.engine.offlineMedia.findById(trackId)
  }

  async putOfflineMedium(media: OfflineMedia): Promise<OfflineMedia> {
    return this.engine.offlineMedia.upsert(media)
  }

  async removeOfflineMedium(trackId: string): Promise<boolean> {
    return this.engine.offlineMedia.delete(trackId)
  }

  async touchOfflineMedium(
    trackId: string,
    openedAt = Date.now(),
  ): Promise<OfflineMedia | undefined> {
    const current = await this.engine.offlineMedia.findById(trackId)
    if (current === undefined) return undefined
    return this.engine.offlineMedia.upsert({ ...current, openedAt })
  }

  async previewSessionCommand(
    sessionId: string,
    command: RpcSessionCommand,
    commandId: string,
  ): Promise<WorkerSessionCommandPreview> {
    const current = await this.session(sessionId)
    if (current === undefined) throw new Error("session is not in the local store")
    const commandIdLength = [...commandId].length
    if (commandIdLength === 0 || commandIdLength > 128) {
      throw new Error("command ID must contain 1 to 128 characters")
    }
    const fingerprint = canonicalJson(command)
    const receiptKey = `${sessionId}:${commandId}`
    const receipt = await this.engine.commandReceipts.findById(receiptKey)
    if (receipt !== undefined) {
      if (receipt.sessionId === sessionId && receipt.fingerprint === fingerprint) {
        return { session: current, replayed: true }
      }
      throw new Error(`command ID ${commandId} already belongs to a different session command`)
    }
    const outbox = await this.engine.outbox.all()
    const existing = outbox.find(
      (entry) =>
        entry.kind === "session.command" &&
        entry.sessionId === sessionId &&
        entry.commandId === commandId,
    )
    if (existing !== undefined) {
      if (
        existing.kind !== "session.command" ||
        existing.sessionId !== sessionId ||
        canonicalJson(existing.command) !== fingerprint
      ) {
        throw new Error(`command ID ${commandId} already belongs to a different session command`)
      }
      const resultIsStored = sessionResultMatches(existing.resultFingerprint, current)
      const supersededLocally = outbox.some(
        (entry) =>
          entry.kind === "session.command" &&
          entry.sessionId === sessionId &&
          entry.id > existing.id,
      )
      if (resultIsStored || supersededLocally) {
        return { session: current, replayed: true }
      }
    }
    // Validation is deliberately before renderer effects. A stale cursor or transport
    // command must fail without first stopping or starting real audio.
    applySessionCommand(current, command)
    return { session: current, replayed: false }
  }

  async queueSessionCommand(
    session: WorkerSession,
    command: RpcSessionCommand,
    commandId?: string,
    expectedRevision?: number,
  ): Promise<WorkerSession> {
    return this.sessionRows.exclusive(() =>
      this.queueLiveCommand(session, command, commandId, expectedRevision),
    )
  }
  private async queueLiveCommand(
    session: WorkerSession,
    command: RpcSessionCommand,
    commandId?: string,
    expectedRevision?: number,
  ): Promise<WorkerSession> {
    if (await this.sessionRows.retired(session.id)) throw new Error("session is retired")
    const row = await this.engine.sessions.findById(session.id)
    const current = row ? normalizeSessionModes(publicSession(row)) : session
    const timerAuthority = row?.timerAuthority ?? authority(current)
    if (expectedRevision !== undefined && current.revision !== expectedRevision) {
      throw new Error(SESSION_CHANGED_DURING_CONFIRMATION)
    }
    const id = nextOutboxId()
    const idempotencyKey = commandId ?? id
    const commandIdLength = [...idempotencyKey].length
    if (commandIdLength === 0 || commandIdLength > 128) {
      throw new Error("command ID must contain 1 to 128 characters")
    }
    const fingerprint = canonicalJson(command)
    const receiptKey = `${session.id}:${idempotencyKey}`
    const receipt = await this.engine.commandReceipts.findById(receiptKey)
    if (receipt !== undefined) {
      if (receipt.sessionId === session.id && receipt.fingerprint === fingerprint) return current
      throw new Error(`command ID ${idempotencyKey} already belongs to a different session command`)
    }
    const outbox = await this.engine.outbox.all()
    const existing = outbox.find(
      (entry) =>
        entry.kind === "session.command" &&
        entry.sessionId === session.id &&
        entry.commandId === idempotencyKey,
    )
    if (existing !== undefined) {
      if (
        existing.kind === "session.command" &&
        existing.sessionId === session.id &&
        canonicalJson(existing.command) === fingerprint
      ) {
        const resultIsStored = sessionResultMatches(existing.resultFingerprint, current)
        const supersededLocally = outbox.some(
          (entry) =>
            entry.kind === "session.command" &&
            entry.sessionId === session.id &&
            entry.id > existing.id,
        )
        const legacyResultProbablyStored =
          existing.resultFingerprint === undefined && current.revision > existing.baseRevision
        const repaired =
          resultIsStored || supersededLocally || legacyResultProbablyStored
            ? current
            : replayPending(current, existing)
        const stored = await this.storeSession(repaired, timerAuthority)
        await this.engine.commandReceipts.upsert({
          id: receiptKey,
          sessionId: session.id,
          fingerprint,
        })
        return stored
      }
      throw new Error(`command ID ${idempotencyKey} already belongs to a different session command`)
    }
    const updated = applySessionCommand(current, command)
    await this.enqueue({
      id,
      createdAt: new Date().toISOString(),
      attempts: 0,
      kind: "session.command",
      sessionId: session.id,
      commandId: idempotencyKey,
      baseRevision: current.revision,
      ...(command._tag === "transport.stop" && current.sleepTimer
        ? { clearedSleepTimerId: current.sleepTimer.id }
        : {}),
      resultFingerprint: canonicalJson(updated),
      command,
    })
    const stored = await this.storeSession(updated, timerAuthority)
    await this.engine.commandReceipts.upsert({
      id: receiptKey,
      sessionId: session.id,
      fingerprint,
    })
    return stored
  }

  async queueListen(event: ListenEventInput): Promise<void> {
    const existing = (await this.engine.outbox.all()).find(
      (entry) =>
        entry.kind === "listen.append" && listenEventId(entry.event) === listenEventId(event),
    )
    if (existing !== undefined) {
      if (
        existing.kind === "listen.append" &&
        canonicalJson(existing.event) === canonicalJson(event)
      ) {
        return
      }
      throw new Error(`listen ID ${listenEventId(event)} already belongs to different content`)
    }
    await this.enqueue({
      id: nextOutboxId(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      kind: "listen.append",
      event,
    })
  }

  async outbox(): Promise<readonly WorkerOutboxEntry[]> {
    // ULIDs sort in creation order, so a queue drains in the order the person acted.
    return [...(await this.engine.outbox.all())].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
  }

  async enqueue(entry: WorkerOutboxEntry): Promise<WorkerOutboxEntry> {
    return this.engine.outbox.upsert(entry)
  }

  async recordAttempt(id: string, error: string): Promise<void> {
    const existing = await this.engine.outbox.findById(id)
    if (existing === undefined) return
    await this.engine.outbox.upsert({
      ...existing,
      attempts: existing.attempts + 1,
      lastError: error,
    })
  }

  async dequeue(id: string): Promise<boolean> {
    return this.engine.outbox.delete(id)
  }

  async settleOutbox(id: string, action: WorkerSettlementAction): Promise<WorkerSettlementResult> {
    const request = this.settlementMutation.then(() => settleOutbox(this, id, action))
    this.settlementMutation = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }

  async close(): Promise<void> {
    await this.engine.close()
  }
}

function canonicalJson(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (typeof input !== "object" || input === null) return input
    return Object.fromEntries(
      Object.entries(input)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return JSON.stringify(canonical(value))
}

function mintDeviceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/// In-memory engine.
///
/// Used by tests, and by any environment without IndexedDB. The database's own rules are
/// identical either way, which is what makes those tests meaningful.
export function createMemoryEngine(): WorkerEngine {
  return {
    meta: new MemoryCollection(),
    settings: new MemoryCollection(),
    albums: new MemoryCollection(),
    sessions: new MemoryCollection(),
    retiredSessions: new MemoryCollection(),
    offlinePins: new MemoryCollection(),
    offlineMedia: new MemoryCollection(),
    commandReceipts: new MemoryCollection(),
    outbox: new MemoryCollection(),
    // There is no persistence to coalesce. Like a failed multi-file durable batch,
    // a failed in-memory operation may leave a prefix for the caller to reconcile.
    batch: async function (operation) {
      return operation(this)
    },
    close: async () => undefined,
  }
}

class MemoryCollection<T extends { readonly id: string }> implements WorkerCollection<T> {
  private readonly rows = new Map<string, T>()

  async findById(id: string): Promise<T | undefined> {
    return this.rows.get(id)
  }

  async all(): Promise<readonly T[]> {
    return [...this.rows.values()]
  }

  async upsert(row: T): Promise<T> {
    this.rows.set(row.id, row)
    return row
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id)
  }
}

// Current-v2 receipts can be interrupted after the optimistic snapshot but before the
// durable receipt. New mode defaults must not make that exact snapshot look unapplied.
function sessionResultMatches(fingerprint: string | undefined, current: WorkerSession): boolean {
  if (fingerprint === undefined) return false
  if (fingerprint === canonicalJson(current)) return true
  const withDefaults = (value: unknown): unknown => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("queue" in value) ||
      !Array.isArray(value.queue)
    )
      return value
    // A core timer update does not invalidate the persisted playback result.
    const { sleepTimer: _timer, ...playback } = { sleepTimer: undefined, ...value }
    return {
      ...playback,
      repeat: "repeat" in value ? value.repeat : "off",
      shuffle: "shuffle" in value ? value.shuffle : false,
      queueOrder: "queueOrder" in value ? value.queueOrder : value.queue.map((_, index) => index),
    }
  }
  try {
    const saved: unknown = JSON.parse(fingerprint)
    return canonicalJson(withDefaults(saved)) === canonicalJson(withDefaults(current))
  } catch {
    return false
  }
}
