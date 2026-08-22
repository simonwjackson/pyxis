/// Page-side handle to the worker database.
///
/// Requests are correlated by id so several can be in flight at once, matching how the RPC
/// transport already behaves. A caller sees plain promises and never a message channel.

import type {
  ListenTrackEventInput,
  RpcPlacement,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"
import { createWorkerRpc, type WorkerRpc } from "../rpc/client"
import type { WorkerAlbum, WorkerDatabase, WorkerOpenReport, WorkerSettings } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { type SyncReport, sync as syncDatabase } from "./sync"

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
  | { readonly _tag: "worker.sessions.read" }
  | { readonly _tag: "worker.session.read"; readonly payload: { id: string } }
  | { readonly _tag: "worker.session.put"; readonly payload: { session: RpcSession } }
  | { readonly _tag: "worker.session.remove"; readonly payload: { id: string } }
  | { readonly _tag: "worker.sync"; readonly payload: { origin?: string } }
  | {
      readonly _tag: "worker.queue.placement"
      readonly payload: { album: WorkerAlbum; placement: RpcPlacement }
    }
  | {
      readonly _tag: "worker.queue.listen"
      readonly payload: { event: ListenTrackEventInput }
    }
  | {
      readonly _tag: "worker.queue.session-command"
      readonly payload: { session: RpcSession; command: RpcSessionCommand; commandId?: string }
    }
)

export class WorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkerUnavailableError"
  }
}

export interface WorkerResponse {
  readonly id: string
  readonly outcome:
    | { readonly status: "ready"; readonly value: unknown }
    | { readonly status: "failed"; readonly message: string }
}

/// Everything a page can do locally.
///
/// Deliberately narrower than `WorkerDatabase`. The queue of unsent writes belongs to sync,
/// which runs inside the worker, so exposing it to the page would invite a second writer.
export interface WorkerClient {
  open(): Promise<WorkerOpenReport>
  settings(): Promise<WorkerSettings>
  writeSettings(patch: Omit<Partial<WorkerSettings>, "id">): Promise<WorkerSettings>
  albums(): Promise<readonly WorkerAlbum[]>
  album(id: string): Promise<WorkerAlbum | undefined>
  replaceAlbums(albums: readonly WorkerAlbum[]): Promise<void>
  putAlbum(album: WorkerAlbum): Promise<WorkerAlbum>
  removeAlbum(id: string): Promise<boolean>
  sessions(): Promise<readonly RpcSession[]>
  session(id: string): Promise<RpcSession | undefined>
  putSession(session: RpcSession): Promise<RpcSession>
  removeSession(id: string): Promise<boolean>
  /// Reconcile with the server. Safe to call when offline: the report says so and the
  /// queue is left intact.
  sync(origin?: string): Promise<SyncReport>
  /// Record a placement change locally and queue it for the server. The album changes
  /// immediately so the person sees their own action, network or not.
  queuePlacement(album: WorkerAlbum, placement: RpcPlacement): Promise<WorkerAlbum>
  queueSessionCommand(
    session: RpcSession,
    command: RpcSessionCommand,
    commandId?: string,
  ): Promise<RpcSession>
  /// Record locally first. Sync owns network replay and idempotency.
  queueListen(event: ListenTrackEventInput): Promise<void>
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
    for (const waiting of pending.values()) waiting.reject(new WorkerUnavailableError(reason))
    pending.clear()
  }
  channel.addEventListener("error", () => abandon("the local store worker failed"))
  channel.addEventListener("messageerror", () =>
    abandon("the local store worker sent an unreadable message"),
  )

  const send = <T>(request: Unaddressed<WorkerRequest>): Promise<T> => {
    // Once the worker is gone nothing can answer, so fail immediately rather than adding
    // a request to a queue that will never drain.
    if (dead !== undefined) return Promise.reject(new WorkerUnavailableError(dead))
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
    sessions: () => send<readonly RpcSession[]>({ _tag: "worker.sessions.read" }),
    session: (id) => send<RpcSession | undefined>({ _tag: "worker.session.read", payload: { id } }),
    putSession: (session) => send<RpcSession>({ _tag: "worker.session.put", payload: { session } }),
    removeSession: (id) => send<boolean>({ _tag: "worker.session.remove", payload: { id } }),
    sync: (origin) =>
      send<SyncReport>({
        _tag: "worker.sync",
        payload: origin === undefined ? {} : { origin },
      }),
    queuePlacement: (album, placement) =>
      send<WorkerAlbum>({ _tag: "worker.queue.placement", payload: { album, placement } }),
    queueSessionCommand: (session, command, commandId) =>
      send<RpcSession>({
        _tag: "worker.queue.session-command",
        payload: {
          session,
          command,
          ...(commandId === undefined ? {} : { commandId }),
        },
      }),
    queueListen: (event) => send<void>({ _tag: "worker.queue.listen", payload: { event } }),
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
  rpcFor?: (settings: WorkerSettings, origin?: string) => WorkerRpc,
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
    sessions: async () => (await database()).sessions(),
    session: async (id) => (await database()).session(id),
    putSession: async (session) => (await database()).putSession(session),
    removeSession: async (id) => (await database()).removeSession(id),
    sync: async (origin) => {
      const store = await database()
      const settings = await store.settings()
      if (rpcFor === undefined) {
        return {
          pulled: 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: (await store.outbox()).length,
          conflicts: [],
          // Test and non-browser fallback. The browser composition root supplies RPC.
          offline: true,
          authRequired: false,
          pageFallbackRequired: true,
        }
      }
      if (settings.bearerToken === undefined) {
        return {
          pulled: 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: (await store.outbox()).length,
          conflicts: [],
          offline: false,
          authRequired: true,
        }
      }
      return syncDatabase(store, rpcFor(settings, origin))
    },
    queuePlacement: async (album, placement) => (await database()).queuePlacement(album, placement),
    queueSessionCommand: async (session, command, commandId) =>
      (await database()).queueSessionCommand(session, command, commandId),
    queueListen: async (event) => (await database()).queueListen(event),
    terminate: () => undefined,
  }
}

export function createFailoverWorkerClient(
  primary: WorkerClient,
  fallback: () => WorkerClient,
): WorkerClient {
  let active = primary
  const retry = async <T>(
    operation: (client: WorkerClient) => Promise<T>,
    startup = false,
  ): Promise<T> => {
    const attempted = active
    try {
      return await operation(attempted)
    } catch (cause) {
      if (attempted !== primary || !startup) throw cause
      if (active === primary) {
        primary.terminate()
        active = fallback()
      }
      return operation(active)
    }
  }

  return {
    open: () => retry((client) => client.open(), true),
    settings: () => retry((client) => client.settings()),
    writeSettings: (patch) => retry((client) => client.writeSettings(patch)),
    albums: () => retry((client) => client.albums()),
    album: (id) => retry((client) => client.album(id)),
    replaceAlbums: (albums) => retry((client) => client.replaceAlbums(albums)),
    putAlbum: (album) => retry((client) => client.putAlbum(album)),
    removeAlbum: (id) => retry((client) => client.removeAlbum(id)),
    sessions: () => retry((client) => client.sessions()),
    session: (id) => retry((client) => client.session(id)),
    putSession: (session) => retry((client) => client.putSession(session)),
    removeSession: (id) => retry((client) => client.removeSession(id)),
    sync: (origin) => retry((client) => client.sync(origin)),
    queuePlacement: (album, placement) =>
      retry((client) => client.queuePlacement(album, placement)),
    queueSessionCommand: (session, command, commandId) =>
      retry((client) => client.queueSessionCommand(session, command, commandId)),
    queueListen: (event) => retry((client) => client.queueListen(event)),
    terminate: () => active.terminate(),
  }
}

/// Spawn the real worker. Vite bundles the entry through this URL form.
///
/// Falls back to an in-process store where `Worker` does not exist, such as a test
/// environment, rather than failing to start.
export function spawnWorkerClient(networkFallback = false): WorkerClient {
  const fallback = () =>
    createDirectWorkerClient(
      undefined,
      networkFallback
        ? (settings, origin) =>
            createWorkerRpc({
              token: settings.bearerToken ?? "",
              ...(origin === undefined ? {} : { origin }),
            })
        : undefined,
    )
  if (typeof Worker === "undefined") return fallback()
  try {
    const primary = createWorkerClient(
      new Worker(new URL("./entry.ts", import.meta.url), { type: "module" }),
    )
    return networkFallback ? createFailoverWorkerClient(primary, fallback) : primary
  } catch {
    // A blocked or unsupported worker must not take the page down with it. The fallback
    // keeps nothing, and says so in its open report.
    return fallback()
  }
}
