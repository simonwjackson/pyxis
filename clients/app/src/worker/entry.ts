/// Worker entry point.
///
/// The database lives here rather than on the page so that storage work, and later sync
/// and downloads, cannot block rendering. The page talks to it through `client.ts`.

import { createWorkerRpc } from "../rpc/client"
import type { WorkerRequest, WorkerResponse } from "./client"
import type { WorkerDatabase } from "./contract"
import { openWorkerDatabase } from "./database"
import {
  browserCacheStorage,
  browserOfflineExclusive,
  createOfflineDownloadManager,
} from "./downloads"
import { createProseqlEngine } from "./proseql-engine"
import { type SyncReport, sync } from "./sync"

/// Declared locally rather than pulled in through the `webworker` lib, which cannot be
/// combined with the DOM lib the rest of this client compiles against.
interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void
  postMessage(message: WorkerResponse): void
}

const scope = self as unknown as WorkerScope

let opening: Promise<WorkerDatabase> | undefined

async function database(): Promise<WorkerDatabase> {
  opening ??= (async () => {
    const handle = await createProseqlEngine()
    return openWorkerDatabase({
      engine: handle.engine,
      clear: handle.clear,
      onReset: (cause) => {
        // The page needs to know its local copy was discarded so it can refetch. Reported
        // rather than thrown, because a reset is a recovery, not a failure.
        console.warn("pyxis worker: local database reset", cause)
      },
    })
  })().catch((cause: unknown) => {
    // A cached rejection would wedge local storage for the life of the page. Let the next
    // request try again, since the usual causes are transient.
    opening = undefined
    throw cause
  })
  return opening
}

async function refreshDatabase(): Promise<WorkerDatabase> {
  const current = opening
  opening = undefined
  if (current !== undefined) await (await current).close().catch(() => undefined)
  return database()
}

const rawOfflineExclusive = browserOfflineExclusive(globalThis.navigator.locks)
const refreshingExclusive = <T>(operation: () => Promise<T>): Promise<T> =>
  rawOfflineExclusive(async () => {
    await refreshDatabase()
    return operation()
  })
const offline = createOfflineDownloadManager(database, {
  fetch: globalThis.fetch.bind(globalThis),
  caches: browserCacheStorage(globalThis.caches),
  estimate: async () => globalThis.navigator.storage.estimate(),
  origin: globalThis.location.origin,
  available: globalThis.navigator.locks !== undefined,
  exclusive: refreshingExclusive,
})

function accountFencedDatabase(
  initial: WorkerDatabase,
  expectedAccountId: string | undefined,
): WorkerDatabase {
  return new Proxy(initial, {
    get(target, property, receiver) {
      const initialValue = Reflect.get(target, property, receiver)
      if (typeof initialValue !== "function") return initialValue
      return (...args: unknown[]) =>
        offline.exclusive(async () => {
          const current = await database()
          if ((await current.settings()).accountId !== expectedAccountId) {
            throw new Error("account changed while sync was in flight")
          }
          const value = Reflect.get(current, property)
          return value.apply(current, args)
        })
    },
  })
}

async function readCurrentAccount<T>(
  expectedAccountId: string | undefined,
  operation: (store: WorkerDatabase) => Promise<T>,
): Promise<T> {
  return offline.exclusive(async () => {
    const current = await database()
    if (
      expectedAccountId !== undefined &&
      (await current.settings()).accountId !== expectedAccountId
    ) {
      throw new Error("this page belongs to a different account; reload it")
    }
    return operation(current)
  })
}

async function mutateCurrentAccount<T>(
  expectedAccountId: string | undefined,
  operation: (store: WorkerDatabase) => Promise<T>,
): Promise<T> {
  return readCurrentAccount(expectedAccountId, operation)
}

async function handle(request: WorkerRequest): Promise<unknown> {
  const store = await database()
  switch (request._tag) {
    case "worker.open":
      return store.report
    case "worker.settings.read":
      return readCurrentAccount(request.accountId, (current) => current.settings())
    case "worker.settings.write":
      return offline.exclusive(async () => {
        const current = await database()
        const before = await current.settings()
        if (request.accountId !== undefined && before.accountId !== request.accountId) {
          throw new Error("account changed while settings were in flight")
        }
        const written = await current.writeSettings(request.payload)
        if (
          before.accountId !== undefined &&
          written.accountId !== undefined &&
          before.accountId !== written.accountId
        ) {
          await offline.clearWithinExclusive().catch((cause: unknown) => {
            // The new account/device identity already makes old cache mappings unreachable.
            // Reconciliation removes orphaned bytes later; cleanup failure must not make a
            // committed grant look rejected to the page.
            console.warn("pyxis worker: old offline cache cleanup failed", cause)
          })
        }
        return written
      })
    case "worker.albums.read":
      return readCurrentAccount(request.accountId, (current) => current.albums())
    case "worker.album.read":
      return readCurrentAccount(request.accountId, (current) => current.album(request.payload.id))
    case "worker.albums.replace":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.replaceAlbums(request.payload.albums),
      )
    case "worker.album.put":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.putAlbum(request.payload.album),
      )
    case "worker.album.remove":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.removeAlbum(request.payload.id),
      )
    case "worker.sessions.read":
      return readCurrentAccount(request.accountId, (current) => current.sessions())
    case "worker.session.read":
      return readCurrentAccount(request.accountId, (current) => current.session(request.payload.id))
    case "worker.session.put":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.putSession(request.payload.session),
      )
    case "worker.session.remove":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.removeSession(request.payload.id),
      )
    case "worker.offline.overview":
      return offline.overview(request.accountId)
    case "worker.offline.pin":
      return offline.pinAlbum(request.payload.albumId, request.accountId)
    case "worker.offline.unpin":
      return offline.unpinAlbum(request.payload.albumId, request.accountId)
    case "worker.offline.resume":
      return offline.resume(request.accountId)
    case "worker.offline.touch":
      return mutateCurrentAccount(request.accountId, () => offline.touch(request.payload.trackId))
    case "worker.offline.clear":
      return offline.clear(request.accountId)
    case "worker.session-command.preview":
      return readCurrentAccount(request.accountId, (current) =>
        current.previewSessionCommand(
          request.payload.sessionId,
          request.payload.command,
          request.payload.commandId,
        ),
      )
    case "worker.queue.placement": {
      const { album, placement } = request.payload
      return mutateCurrentAccount(request.accountId, (current) =>
        current.queuePlacement(album, placement),
      )
    }
    case "worker.queue.listen":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.queueListen(request.payload.event),
      )
    case "worker.queue.session-command":
      return mutateCurrentAccount(request.accountId, (current) =>
        current.queueSessionCommand(
          request.payload.session,
          request.payload.command,
          request.payload.commandId,
          request.payload.expectedRevision,
        ),
      )
    case "worker.sync": {
      const settings = await readCurrentAccount(request.accountId, (current) => current.settings())
      if (settings.bearerToken === undefined) {
        // Nothing to reconcile with until this device has an account. That is a
        // credentials problem, not a network one, and saying so is the difference between
        // a client that waits forever and one that asks to be paired.
        const report: SyncReport = {
          pulled: 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: await readCurrentAccount(
            request.accountId,
            async (current) => (await current.outbox()).length,
          ),
          conflicts: [],
          offline: false,
          authRequired: true,
        }
        return report
      }
      const report = await sync(
        accountFencedDatabase(await database(), settings.accountId),
        createWorkerRpc({
          token: settings.bearerToken,
          ...(request.payload.origin === undefined ? {} : { origin: request.payload.origin }),
        }),
      )
      await offline.resume(request.accountId).catch((cause: unknown) => {
        // Cache Storage is optional at runtime. Sync success must remain usable when the
        // browser blocks or corrupts only the offline-media subsystem.
        console.warn("pyxis worker: offline resume failed", cause)
      })
      return report
    }
  }
}

let requestChain: Promise<void> = Promise.resolve()
let syncChain: Promise<void> = Promise.resolve()

async function respond(request: WorkerRequest): Promise<void> {
  try {
    // `undefined` survives a structured clone as a property value, so a missing album
    // stays missing instead of arriving as null and disagreeing with the declared type.
    const response: WorkerResponse = {
      id: request.id,
      outcome: { status: "ready", value: await handle(request) },
    }
    scope.postMessage(response)
  } catch (cause) {
    const response: WorkerResponse = {
      id: request.id,
      outcome: {
        status: "failed",
        message: cause instanceof Error ? cause.message : "worker operation failed",
      },
    }
    scope.postMessage(response)
  }
}

scope.addEventListener("message", (event) => {
  if (event.data._tag === "worker.sync") {
    // Network sync can spend seconds outside the database. Keep one sync at a time, but do
    // not make precious local writes wait behind it; each sync database access is already
    // refreshed and serialized under the cross-tab lock.
    syncChain = syncChain.then(() => respond(event.data))
    return
  }
  // Local requests are short and may refresh the stateful ProseQL owner under the lock.
  requestChain = requestChain.then(() => respond(event.data))
})
