/// Local database behind the worker boundary.
///
/// Opening is the interesting part. A store that is corrupt, or that belongs to a newer
/// build, is discarded and reported rather than half-read. A client that silently renders
/// half a database is worse than one that refetches.

import { monotonicFactory } from "ulid"
import type {
  ListenTrackEventInput,
  RpcPlacement,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"
import {
  SCHEMA_ROW_ID,
  SESSION_CHANGED_DURING_CONFIRMATION,
  SETTINGS_ROW_ID,
  WORKER_MIGRATIONS,
  WORKER_SCHEMA_VERSION,
  type WorkerAlbum,
  type WorkerCollection,
  type WorkerDatabase,
  type WorkerEngine,
  type WorkerMigrations,
  type WorkerOpenReason,
  type WorkerOpenReport,
  type WorkerOutboxEntry,
  type WorkerSession,
  type WorkerSessionCommandPreview,
  type WorkerSettings,
} from "./contract"
import { applySessionCommand } from "./session-local"

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
  const [settings, albums, sessions, commandReceipts, outbox] = await Promise.all([
    engine.settings.all(),
    engine.albums.all(),
    engine.sessions.all(),
    engine.commandReceipts.all(),
    engine.outbox.all(),
  ])
  return (
    settings.length === 0 &&
    albums.length === 0 &&
    sessions.length === 0 &&
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
    engine.commandReceipts,
    engine.outbox,
  ]) {
    const rows = await collection.all()
    for (const row of rows) await collection.delete(row.id)
  }
}

class LocalWorkerDatabase implements WorkerDatabase {
  private settingsMutation: Promise<void> = Promise.resolve()

  constructor(
    private readonly engine: WorkerEngine,
    readonly report: WorkerOpenReport,
  ) {}

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
      for (const receipt of await this.engine.commandReceipts.all()) {
        await this.engine.commandReceipts.delete(receipt.id)
      }
      // A realtime cursor is scoped to the old account and cannot cross the boundary.
      const {
        resumeToken: _resumeToken,
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

  async replaceAlbums(albums: readonly WorkerAlbum[]): Promise<void> {
    const incoming = new Map(albums.map((album) => [album.id, album]))
    const existing = await this.engine.albums.all()
    for (const album of existing) {
      if (!incoming.has(album.id)) await this.engine.albums.delete(album.id)
    }
    for (const album of albums) await this.engine.albums.upsert(album)
  }

  async putAlbum(album: WorkerAlbum): Promise<WorkerAlbum> {
    const existing = await this.engine.albums.findById(album.id)
    // Local and remote writes arrive on independent channels with no ordering between
    // them, so the revision decides rather than arrival.
    if (existing !== undefined && existing.revision > album.revision) return existing
    return this.engine.albums.upsert(album)
  }

  async replaceAlbum(album: WorkerAlbum): Promise<WorkerAlbum> {
    return this.engine.albums.upsert(album)
  }

  async removeAlbum(id: string): Promise<boolean> {
    return this.engine.albums.delete(id)
  }

  async sessions(): Promise<readonly WorkerSession[]> {
    return this.engine.sessions.all()
  }

  async session(id: string): Promise<WorkerSession | undefined> {
    return this.engine.sessions.findById(id)
  }

  async putSession(session: WorkerSession): Promise<WorkerSession> {
    const existing = await this.engine.sessions.findById(session.id)
    if (existing !== undefined && existing.revision > session.revision) return existing
    return this.engine.sessions.upsert(session)
  }

  async replaceSession(session: WorkerSession): Promise<WorkerSession> {
    return this.engine.sessions.upsert(session)
  }

  async removeSession(id: string): Promise<boolean> {
    return this.engine.sessions.delete(id)
  }

  async previewSessionCommand(
    sessionId: string,
    command: RpcSessionCommand,
    commandId: string,
  ): Promise<WorkerSessionCommandPreview> {
    const current = await this.engine.sessions.findById(sessionId)
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
      const resultIsStored =
        existing.resultFingerprint !== undefined &&
        existing.resultFingerprint === canonicalJson(current)
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
    const current = (await this.engine.sessions.findById(session.id)) ?? session
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
        const resultIsStored =
          existing.resultFingerprint !== undefined &&
          existing.resultFingerprint === canonicalJson(current)
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
            : applySessionCommand(current, command)
        const stored = await this.engine.sessions.upsert(repaired)
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
      resultFingerprint: canonicalJson(updated),
      command,
    })
    const stored = await this.engine.sessions.upsert(updated)
    await this.engine.commandReceipts.upsert({
      id: receiptKey,
      sessionId: session.id,
      fingerprint,
    })
    return stored
  }

  async queuePlacement(album: WorkerAlbum, placement: RpcPlacement): Promise<WorkerAlbum> {
    // A later click can carry the snapshot that was visible before an earlier write
    // finished syncing. Keep the newest stored metadata and revision, but the newest human
    // intent always wins locally.
    const current = await this.engine.albums.findById(album.id)
    // Preserve the replay record first. If storage fails between these writes, a future
    // sync can still recover the intent. The inverse order can lose it forever.
    await this.enqueue({
      id: nextOutboxId(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      kind: "album.placement",
      albumId: album.id,
      placement,
      baseRevision: album.revision,
      basePlacement: album.placement,
    })
    return this.engine.albums.upsert({ ...album, ...current, placement })
  }

  async queueListen(event: ListenTrackEventInput): Promise<void> {
    const existing = (await this.engine.outbox.all()).find(
      (entry) => entry.kind === "listen.append" && entry.event.id === event.id,
    )
    if (existing !== undefined) {
      if (
        existing.kind === "listen.append" &&
        canonicalJson(existing.event) === canonicalJson(event)
      ) {
        return
      }
      throw new Error(`listen ID ${event.id} already belongs to different content`)
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
    commandReceipts: new MemoryCollection(),
    outbox: new MemoryCollection(),
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
