/// Page-side handle to the worker database.
///
/// Requests are correlated by id so several can be in flight at once, matching how the RPC
/// transport already behaves. A caller sees plain promises and never a message channel.

import type { WorkerAlbum, WorkerDatabase, WorkerOpenReport, WorkerSettings } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"

export type WorkerRequest = { readonly id: string } & (
  | { readonly _tag: "worker.open" }
  | { readonly _tag: "worker.settings.read" }
  | {
      readonly _tag: "worker.settings.write"
      readonly payload: Omit<Partial<WorkerSettings>, "id">
    }
  | { readonly _tag: "worker.albums.read" }
  | { readonly _tag: "worker.album.read"; readonly payload: { id: string } }
  | { readonly _tag: "worker.albums.replace"; readonly payload: { albums: readonly WorkerAlbum[] } }
  | { readonly _tag: "worker.album.put"; readonly payload: { album: WorkerAlbum } }
  | { readonly _tag: "worker.album.remove"; readonly payload: { id: string } }
)

export interface WorkerResponse {
  readonly id: string
  readonly outcome:
    | { readonly status: "ready"; readonly value: unknown }
    | { readonly status: "failed"; readonly message: string }
}

/// Everything a page can do locally. Mirrors `WorkerDatabase` minus lifecycle.
export type WorkerClient = Omit<WorkerDatabase, "report" | "close"> & {
  open(): Promise<WorkerOpenReport>
  terminate(): void
}

/// Distributes over the union, so each variant keeps its own payload.
type Unaddressed<T> = T extends unknown ? Omit<T, "id"> : never

interface Channel {
  postMessage(message: WorkerRequest): void
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: "error" | "messageerror", listener: () => void): void
  terminate?(): void
}

export function createWorkerClient(channel: Channel): WorkerClient {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (cause: unknown) => void }
  >()
  let nextId = 0

  channel.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data
    const waiting = pending.get(response.id)
    if (waiting === undefined) return
    pending.delete(response.id)
    if (response.outcome.status === "ready") waiting.resolve(response.outcome.value)
    else waiting.reject(new Error(response.outcome.message))
  })

  // A worker that dies takes every in-flight request with it. Without this the caller
  // waits forever on a promise that can no longer settle, and the page shows nothing.
  let dead: string | undefined
  const abandon = (reason: string) => {
    dead = reason
    for (const waiting of pending.values()) waiting.reject(new Error(reason))
    pending.clear()
  }
  channel.addEventListener("error", () => abandon("the local store worker failed"))
  channel.addEventListener("messageerror", () =>
    abandon("the local store worker sent an unreadable message"),
  )

  const send = <T>(request: Unaddressed<WorkerRequest>): Promise<T> => {
    // Once the worker is gone nothing can answer, so fail immediately rather than adding
    // a request to a queue that will never drain.
    if (dead !== undefined) return Promise.reject(new Error(dead))
    nextId += 1
    const id = `${nextId}`
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      channel.postMessage({ ...request, id } as WorkerRequest)
    })
  }

  return {
    open: () => send<WorkerOpenReport>({ _tag: "worker.open" }),
    settings: () => send<WorkerSettings>({ _tag: "worker.settings.read" }),
    writeSettings: (patch) =>
      send<WorkerSettings>({ _tag: "worker.settings.write", payload: patch }),
    albums: () => send<readonly WorkerAlbum[]>({ _tag: "worker.albums.read" }),
    album: (id) => send<WorkerAlbum | undefined>({ _tag: "worker.album.read", payload: { id } }),
    replaceAlbums: (albums) => send<void>({ _tag: "worker.albums.replace", payload: { albums } }),
    putAlbum: (album) => send<WorkerAlbum>({ _tag: "worker.album.put", payload: { album } }),
    removeAlbum: (id) => send<boolean>({ _tag: "worker.album.remove", payload: { id } }),
    terminate: () => {
      abandon("the local store worker was stopped")
      channel.terminate?.()
    },
  }
}

/// Run the database on this thread instead of in a worker.
///
/// Used by tests and by any environment without `Worker`. It is explicitly ephemeral, so a
/// caller can tell the difference rather than quietly believing its data is being kept.
export function createDirectWorkerClient(
  open: () => Promise<WorkerDatabase> = () => openWorkerDatabase({ engine: createMemoryEngine() }),
): WorkerClient {
  let opening: Promise<WorkerDatabase> | undefined
  const database = () =>
    (opening ??= open().catch((cause: unknown) => {
      // A cached rejection would wedge the store for good. Let the next call retry.
      opening = undefined
      throw cause
    }))

  return {
    open: async () => ({ ...(await database()).report, ephemeral: true }),
    settings: async () => (await database()).settings(),
    writeSettings: async (patch) => (await database()).writeSettings(patch),
    albums: async () => (await database()).albums(),
    album: async (id) => (await database()).album(id),
    replaceAlbums: async (albums) => (await database()).replaceAlbums(albums),
    putAlbum: async (album) => (await database()).putAlbum(album),
    removeAlbum: async (id) => (await database()).removeAlbum(id),
    terminate: () => undefined,
  }
}

/// Spawn the real worker. Vite bundles the entry through this URL form.
///
/// Falls back to an in-process store where `Worker` does not exist, such as a test
/// environment, rather than failing to start.
export function spawnWorkerClient(): WorkerClient {
  if (typeof Worker === "undefined") return createDirectWorkerClient()
  const worker = new Worker(new URL("./entry.ts", import.meta.url), { type: "module" })
  return createWorkerClient(worker)
}
