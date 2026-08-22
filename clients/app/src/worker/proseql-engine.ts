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

const config = {
  meta: { schema: MetaSchema, file: "./pyxis/meta.json", relationships: {} },
  settings: { schema: SettingsSchema, file: "./pyxis/settings.json", relationships: {} },
  albums: { schema: AlbumSchema, file: "./pyxis/albums.json", relationships: {} },
} as const

interface StoredAlbum {
  readonly id: string
  readonly revision: number
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
    albums: albumCollection(raw.albums),
    close: async () => {
      await raw.close?.()
    },
  }

  return {
    engine,
    clear: async () => {
      for (const collection of [raw.meta, raw.settings, raw.albums]) {
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

/// Albums are stored with their identity and revision promoted out of the body, so the
/// engine can index them without the client contract leaking into the stored schema.
function albumCollection(collection: RawCollection): WorkerCollection<WorkerAlbum> {
  const unwrap = (stored: StoredAlbum): WorkerAlbum => stored.body as WorkerAlbum
  return {
    async findById(id) {
      const found = await collection.findById(id)
      if (found === undefined || found === null) return undefined
      return unwrap(plain<StoredAlbum>(found))
    },
    async all() {
      return plain<StoredAlbum[]>(await collection.query()).map(unwrap)
    },
    async upsert(album) {
      await collection.upsert({ id: album.id, revision: album.revision, body: album })
      return album
    },
    async delete(id) {
      const existing = await collection.findById(id)
      if (existing === undefined || existing === null) return false
      await collection.delete(id)
      return true
    },
  }
}
