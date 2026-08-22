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
  type WorkerEngine,
  type WorkerOutboxEntry,
  type WorkerSchemaRow,
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
  bearerToken: Schema.optional(Schema.String),
  resumeToken: Schema.optional(Schema.String),
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
const OutboxSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  body: Schema.Unknown,
})

const config = {
  meta: { schema: MetaSchema, file: "./pyxis/meta.json", relationships: {} },
  settings: { schema: SettingsSchema, file: "./pyxis/settings.json", relationships: {} },
  albums: { schema: AlbumSchema, file: "./pyxis/albums.json", relationships: {} },
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

export async function createProseqlEngine(): Promise<ProseqlEngineHandle> {
  await initializeWorkerWasmBindings()

  const storageHost = createServiceWorkerIndexedDBEngineStorageHost({
    databaseName: WORKER_DATABASE_NAME,
    storeName: "collections",
    version: 1,
    keyPrefix: KEY_PREFIX,
    channelName: CHANNEL_NAME,
    originId: ORIGIN_ID,
  })

  const database = await createServiceWorkerEngineDatabase(
    config,
    { meta: [], settings: [], albums: [] },
    { storageHost, writeDebounce: 0 },
  )

  const raw = database as unknown as RawEngine

  const engine: WorkerEngine = {
    meta: adapt<WorkerSchemaRow>(raw.meta),
    settings: adapt<WorkerSettings>(raw.settings),
    albums: wrapped<WorkerAlbum>(raw.albums, (album) => ({
      id: album.id,
      revision: album.revision,
    })),
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
      for (const collection of [raw.meta, raw.settings, raw.albums, raw.outbox]) {
        for (const row of plain<{ id: string }[]>(await collection.query())) {
          await collection.delete(row.id)
        }
      }
    },
  }
}

interface RawCollection {
  findById(id: string): Promise<unknown>
  query(config?: unknown): Promise<unknown>
  upsert(row: unknown): Promise<unknown>
  delete(id: string): Promise<unknown>
}

interface RawEngine {
  readonly meta: RawCollection
  readonly settings: RawCollection
  readonly albums: RawCollection
  readonly outbox: RawCollection
  close?(): Promise<void>
}

function adapt<T extends { readonly id: string }>(collection: RawCollection): WorkerCollection<T> {
  return {
    async findById(id) {
      const found = await collection.findById(id)
      return found === undefined || found === null ? undefined : plain<T>(found)
    },
    async all() {
      return plain<T[]>(await collection.query())
    },
    async upsert(row) {
      await collection.upsert(row)
      return row
    },
    async delete(id) {
      const existing = await collection.findById(id)
      if (existing === undefined || existing === null) return false
      await collection.delete(id)
      return true
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
      const found = await collection.findById(id)
      if (found === undefined || found === null) return undefined
      return unwrap(plain<Stored>(found))
    },
    async all() {
      return plain<Stored[]>(await collection.query()).map(unwrap)
    },
    async upsert(row) {
      await collection.upsert({ ...indexed(row), id: row.id, body: row })
      return row
    },
    async delete(id) {
      const existing = await collection.findById(id)
      if (existing === undefined || existing === null) return false
      await collection.delete(id)
      return true
    },
  }
}
