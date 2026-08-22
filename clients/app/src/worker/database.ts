/// Local database behind the worker boundary.
///
/// Opening is the interesting part. A store that is corrupt, or that belongs to a newer
/// build, is discarded and reported rather than half-read. A client that silently renders
/// half a database is worse than one that refetches.

import {
  SCHEMA_ROW_ID,
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
  type WorkerSettings,
} from "./contract"

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
  const [settings, albums, outbox] = await Promise.all([
    engine.settings.all(),
    engine.albums.all(),
    engine.outbox.all(),
  ])
  return settings.length === 0 && albums.length === 0 && outbox.length === 0
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
  for (const collection of [engine.meta, engine.settings, engine.albums, engine.outbox]) {
    const rows = await collection.all()
    for (const row of rows) await collection.delete(row.id)
  }
}

class LocalWorkerDatabase implements WorkerDatabase {
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
    const current = await this.settings()
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

  async removeAlbum(id: string): Promise<boolean> {
    return this.engine.albums.delete(id)
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
