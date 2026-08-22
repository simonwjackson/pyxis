/// ProseQL WASM engine over IndexedDB, adapted to the narrow worker engine interface.
///
/// This file is the only place that knows ProseQL exists. Everything above it works
/// against `WorkerEngine`, which is also what makes the database's rules testable without
/// a browser, a worker, or WASM.

import {
  createServiceWorkerEngineDatabase,
  createServiceWorkerIndexedDBEngineStorageHost,
  initializeWorkerWasmBindings,
} from "@proseql/browser/worker"
import { Schema } from "effect"
import {
  WORKER_DATABASE_NAME,
  type WorkerAlbum,
  type WorkerCollection,
  type WorkerCommandReceipt,
  type WorkerEngine,
  type WorkerOutboxEntry,
  type WorkerSchemaRow,
  type WorkerSession,
  type WorkerSettings,
} from "./contract"

const CHANNEL_NAME = "pyxis-worker"
const ORIGIN_ID = "pyxis-worker-v1"
const KEY_PREFIX = "pyxis-v1:"

const MetaSchema = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
})

const SettingsSchema = Schema.Struct({
  id: Schema.String,
  deviceId: Schema.optional(Schema.String),
  accountId: Schema.optional(Schema.String),
  accountName: Schema.optional(Schema.String),
  accountIsDefault: Schema.optional(Schema.Boolean),
  accountCreatedAt: Schema.optional(Schema.String),
  deviceName: Schema.optional(Schema.String),
  bearerToken: Schema.optional(Schema.String),
  resumeToken: Schema.optional(Schema.String),
  syncNotices: Schema.optional(Schema.Unknown),
})

/// The album body is stored opaquely. Its shape is owned by the server contract, and
/// restating it here would create a second definition to keep in step.
const AlbumSchema = Schema.Struct({
  id: Schema.String,
  revision: Schema.Number,
  body: Schema.Unknown,
})

/// Queued writes are stored opaquely too. Their shape is a union owned by the worker
/// contract, and the engine only needs to find them in order.
const SessionSchema = Schema.Struct({
  id: Schema.String,
  revision: Schema.Number,
  body: Schema.Unknown,
})

const CommandReceiptSchema = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  fingerprint: Schema.String,
})

const OutboxSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  body: Schema.Unknown,
})

const config = {
  meta: { schema: MetaSchema, file: "./pyxis/meta.json", relationships: {} },
  settings: { schema: SettingsSchema, file: "./pyxis/settings.json", relationships: {} },
  albums: { schema: AlbumSchema, file: "./pyxis/albums.json", relationships: {} },
  sessions: { schema: SessionSchema, file: "./pyxis/sessions.json", relationships: {} },
  commandReceipts: {
    schema: CommandReceiptSchema,
    file: "./pyxis/command-receipts.json",
    relationships: {},
  },
  outbox: { schema: OutboxSchema, file: "./pyxis/outbox.json", relationships: {} },
} as const

interface Stored {
  readonly id: string
  readonly body: unknown
}

/// WASM returns exotic objects that structured clone rejects at the postMessage boundary.
/// A JSON round trip restores plain, cloneable data.
function plain<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface ProseqlEngineHandle {
  readonly engine: WorkerEngine
  readonly clear: () => Promise<void>
}

export interface ProseqlEngineOptions {
  /// Where rows are kept. Defaults to IndexedDB, which only exists in a browser. Tests
  /// supply their own so this adapter can be exercised against the real engine.
  readonly storageHost?: unknown
  /// Pre-fetched WASM. The default fetches it relative to the package, which needs a
  /// browser.
  readonly wasm?: WebAssembly.Module
}

export async function createProseqlEngine(
  options: ProseqlEngineOptions = {},
): Promise<ProseqlEngineHandle> {
  await initializeWorkerWasmBindings(options.wasm)

  const storageHost =
    options.storageHost ??
    createServiceWorkerIndexedDBEngineStorageHost({
      databaseName: WORKER_DATABASE_NAME,
      storeName: "collections",
      version: 1,
      keyPrefix: KEY_PREFIX,
      channelName: CHANNEL_NAME,
      originId: ORIGIN_ID,
    })

  const database = await createServiceWorkerEngineDatabase(
    config,
    { meta: [], settings: [], albums: [], sessions: [], commandReceipts: [], outbox: [] },
    { storageHost, writeDebounce: 0 } as never,
  )

  const raw = database as unknown as RawEngine

  const engine: WorkerEngine = {
    meta: adapt<WorkerSchemaRow>(raw.meta),
    settings: adapt<WorkerSettings>(raw.settings),
    albums: wrapped<WorkerAlbum>(raw.albums, (album) => ({
      id: album.id,
      revision: album.revision,
    })),
    sessions: wrapped<WorkerSession>(raw.sessions, (session) => ({
      id: session.id,
      revision: session.revision,
    })),
    commandReceipts: adapt<WorkerCommandReceipt>(raw.commandReceipts),
    outbox: wrapped<WorkerOutboxEntry>(raw.outbox, (entry) => ({
      id: entry.id,
      kind: entry.kind,
    })),
    close: async () => {
      await raw.close?.()
    },
  }

  return {
    engine,
    clear: async () => {
      for (const collection of [
        raw.meta,
        raw.settings,
        raw.albums,
        raw.sessions,
        raw.commandReceipts,
        raw.outbox,
      ]) {
        for (const row of plain<{ id: string }[]>(await collection.query())) {
          await optional(() => collection.delete(row.id))
        }
      }
    },
  }
}

/// The engine's real surface.
///
/// Three details decide whether any of this works, and all three were assumed wrongly the
/// first time: `findById` and `delete` reject with a not-found error rather than resolving
/// to nothing, and `upsert` takes a where/create/update triple rather than a row.
interface RawCollection {
  findById(id: string): Promise<unknown>
  query(config?: unknown): Promise<unknown>
  upsert(input: { where: { id: string }; create: unknown; update: unknown }): Promise<unknown>
  delete(id: string): Promise<unknown>
}

/// Absence is an ordinary answer here, not a failure. The engine reports it by rejecting,
/// so every read has to translate that back into a value.
async function optional<T>(read: () => Promise<unknown>): Promise<T | undefined> {
  try {
    const found = await read()
    return found === null ? undefined : (found as T)
  } catch (cause) {
    if (isNotFound(cause)) return undefined
    throw cause
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "NotFoundError"
  )
}

interface RawEngine {
  readonly meta: RawCollection
  readonly settings: RawCollection
  readonly albums: RawCollection
  readonly sessions: RawCollection
  readonly commandReceipts: RawCollection
  readonly outbox: RawCollection
  close?(): Promise<void>
}

function adapt<T extends { readonly id: string }>(collection: RawCollection): WorkerCollection<T> {
  return {
    async findById(id) {
      const found = await optional<unknown>(() => collection.findById(id))
      return found === undefined ? undefined : plain<T>(found)
    },
    async all() {
      return plain<T[]>(await collection.query())
    },
    async upsert(row) {
      // The engine treats `id` as immutable, so the update half must not restate it.
      const { id: _id, ...changes } = row
      await collection.upsert({ where: { id: row.id }, create: row, update: changes })
      return row
    },
    async delete(id) {
      const removed = await optional<unknown>(() => collection.delete(id))
      return removed !== undefined
    },
  }
}

/// Records whose shape belongs to a contract elsewhere are stored with only the fields the
/// engine indexes promoted out of an opaque body. That keeps a server contract change from
/// becoming a local schema migration.
function wrapped<T extends { readonly id: string }>(
  collection: RawCollection,
  indexed: (row: T) => Record<string, unknown>,
): WorkerCollection<T> {
  const unwrap = (stored: Stored): T => stored.body as T
  return {
    async findById(id) {
      const found = await optional<unknown>(() => collection.findById(id))
      return found === undefined ? undefined : unwrap(plain<Stored>(found))
    },
    async all() {
      return plain<Stored[]>(await collection.query()).map(unwrap)
    },
    async upsert(row) {
      const stored = { ...indexed(row), id: row.id, body: row }
      const { id: _id, ...changes } = stored
      await collection.upsert({ where: { id: row.id }, create: stored, update: changes })
      return row
    },
    async delete(id) {
      const removed = await optional<unknown>(() => collection.delete(id))
      return removed !== undefined
    },
  }
}
