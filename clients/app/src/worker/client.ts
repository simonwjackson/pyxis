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
import type {
  OfflineOverview,
  WorkerAlbum,
  WorkerDatabase,
  WorkerOpenReport,
  WorkerSessionCommandPreview,
  WorkerSettings,
} from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import type { OfflineDownloadManager } from "./downloads"
import { type SyncReport, sync as syncDatabase } from "./sync"

export type WorkerRequest = { readonly id: string; readonly accountId?: string } & (
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
  | { readonly _tag: "worker.offline.overview" }
  | { readonly _tag: "worker.offline.pin"; readonly payload: { albumId: string } }
  | { readonly _tag: "worker.offline.unpin"; readonly payload: { albumId: string } }
  | { readonly _tag: "worker.offline.resume" }
  | { readonly _tag: "worker.offline.touch"; readonly payload: { trackId: string } }
  | { readonly _tag: "worker.offline.clear" }
  | {
      readonly _tag: "worker.session-command.preview"
      readonly payload: { sessionId: string; command: RpcSessionCommand; commandId: string }
    }
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
      readonly payload: {
        session: RpcSession
        command: RpcSessionCommand
        commandId?: string
        expectedRevision?: number
      }
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
  offlineOverview(): Promise<OfflineOverview>
  pinAlbum(albumId: string): Promise<OfflineOverview>
  unpinAlbum(albumId: string): Promise<OfflineOverview>
  resumeOffline(): Promise<OfflineOverview>
  touchOfflineTrack(trackId: string): Promise<void>
  clearOffline(): Promise<void>
  previewSessionCommand(
    sessionId: string,
    command: RpcSessionCommand,
    commandId: string,
  ): Promise<WorkerSessionCommandPreview>
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
    expectedRevision?: number,
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
  // Bound to the account this page booted with. Another tab can switch the shared store,
  // but this stale page must then fail rather than silently mutate the new account.
  let activeAccountId: string | undefined
  let activeDeviceId: string | undefined
  let activeBearerToken: string | undefined
  let activeStreamEpoch = 0

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
      channel.postMessage({
        ...request,
        id,
        ...(activeAccountId === undefined ? {} : { accountId: activeAccountId }),
      } as WorkerRequest)
    })
  }

  return {
    open: () => send<WorkerOpenReport>({ _tag: "worker.open" }),
    settings: async () => {
      const settings = await send<WorkerSettings>({ _tag: "worker.settings.read" })
      await reconcilePendingStreamSwitch(settings)
      activeAccountId ??= settings.accountId
      activeDeviceId ??= settings.deviceId
      activeBearerToken ??= settings.bearerToken
      activeStreamEpoch = Math.max(activeStreamEpoch, settings.streamEpoch ?? 0)
      return settings
    },
    writeSettings: async (patch) => {
      const changesAccount = patch.accountId !== undefined && patch.accountId !== activeAccountId
      if (changesAccount && pendingStreamSwitches().length > 0) {
        throw new Error("a previous account switch is unresolved; reload before retrying")
      }
      const serviceWorkerFence = changesAccount
        ? await serviceWorkerStreamFence()
        : { streamEpoch: activeStreamEpoch }
      const nextEpoch = changesAccount
        ? Math.max(
            activeStreamEpoch + 1,
            serviceWorkerFence.streamEpoch + 1,
            patch.streamEpoch ?? 0,
            1,
          )
        : Math.max(activeStreamEpoch, patch.streamEpoch ?? 0)
      const previous = {
        accountId: activeAccountId,
        deviceId: activeDeviceId,
        token: activeBearerToken,
        streamEpoch: activeStreamEpoch,
      }
      const transactionId = changesAccount ? crypto.randomUUID() : undefined
      let revoked = false
      if (changesAccount && transactionId !== undefined) {
        const pending =
          activeAccountId !== undefined &&
          activeDeviceId !== undefined &&
          activeBearerToken !== undefined
            ? {
                fromEpoch: nextEpoch,
                transactionId,
                streamEpoch: activeStreamEpoch,
                accountId: activeAccountId,
                deviceId: activeDeviceId,
                token: activeBearerToken,
              }
            : undefined
        if (pending !== undefined) savePendingStreamSwitch(pending)
        try {
          await revokeServiceWorkerStreams(nextEpoch, transactionId)
          revoked = true
        } catch (cause) {
          if (pending !== undefined) {
            try {
              const fence = await serviceWorkerStreamFence()
              if (
                fence.streamEpoch === pending.fromEpoch &&
                fence.transactionId === pending.transactionId
              ) {
                await rollbackServiceWorkerStreams(pending)
              }
              // A different transaction owns the fence, or this revoke never landed.
              clearPendingStreamSwitch(pending.transactionId)
            } catch {
              // Preserve exact recovery ownership when the fence cannot be inspected.
            }
          }
          throw cause
        }
      }
      try {
        const settings = await send<WorkerSettings>({
          _tag: "worker.settings.write",
          payload: {
            ...patch,
            ...(patch.accountId === undefined ? {} : { streamEpoch: nextEpoch }),
          },
        })
        activeAccountId = settings.accountId
        activeDeviceId = settings.deviceId
        activeBearerToken = settings.bearerToken
        activeStreamEpoch = settings.streamEpoch ?? nextEpoch
        if (transactionId !== undefined) clearPendingStreamSwitch(transactionId)
        return settings
      } catch (cause) {
        if (
          revoked &&
          !(cause instanceof WorkerUnavailableError) &&
          previous.accountId !== undefined &&
          previous.deviceId !== undefined &&
          previous.token !== undefined
        ) {
          await rollbackServiceWorkerStreams({
            fromEpoch: nextEpoch,
            transactionId: transactionId as string,
            streamEpoch: previous.streamEpoch,
            accountId: previous.accountId,
            deviceId: previous.deviceId,
            token: previous.token,
          })
            .then(() => clearPendingStreamSwitch(transactionId as string))
            .catch(() => undefined)
        }
        throw cause
      }
    },
    albums: () => send<readonly WorkerAlbum[]>({ _tag: "worker.albums.read" }),
    album: (id) => send<WorkerAlbum | undefined>({ _tag: "worker.album.read", payload: { id } }),
    replaceAlbums: (albums) => send<void>({ _tag: "worker.albums.replace", payload: { albums } }),
    putAlbum: (album) => send<WorkerAlbum>({ _tag: "worker.album.put", payload: { album } }),
    removeAlbum: (id) => send<boolean>({ _tag: "worker.album.remove", payload: { id } }),
    sessions: () => send<readonly RpcSession[]>({ _tag: "worker.sessions.read" }),
    session: (id) => send<RpcSession | undefined>({ _tag: "worker.session.read", payload: { id } }),
    putSession: (session) => send<RpcSession>({ _tag: "worker.session.put", payload: { session } }),
    removeSession: (id) => send<boolean>({ _tag: "worker.session.remove", payload: { id } }),
    offlineOverview: () => send<OfflineOverview>({ _tag: "worker.offline.overview" }),
    pinAlbum: (albumId) =>
      send<OfflineOverview>({ _tag: "worker.offline.pin", payload: { albumId } }),
    unpinAlbum: (albumId) =>
      send<OfflineOverview>({ _tag: "worker.offline.unpin", payload: { albumId } }),
    resumeOffline: () => send<OfflineOverview>({ _tag: "worker.offline.resume" }),
    touchOfflineTrack: (trackId) =>
      send<void>({ _tag: "worker.offline.touch", payload: { trackId } }),
    clearOffline: () => send<void>({ _tag: "worker.offline.clear" }),
    previewSessionCommand: (sessionId, command, commandId) =>
      send<WorkerSessionCommandPreview>({
        _tag: "worker.session-command.preview",
        payload: { sessionId, command, commandId },
      }),
    sync: (origin) =>
      send<SyncReport>({
        _tag: "worker.sync",
        payload: origin === undefined ? {} : { origin },
      }),
    queuePlacement: (album, placement) =>
      send<WorkerAlbum>({ _tag: "worker.queue.placement", payload: { album, placement } }),
    queueSessionCommand: (session, command, commandId, expectedRevision) =>
      send<RpcSession>({
        _tag: "worker.queue.session-command",
        payload: {
          session,
          command,
          ...(commandId === undefined ? {} : { commandId }),
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
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
  offlineFor?: (database: () => Promise<WorkerDatabase>) => OfflineDownloadManager,
): WorkerClient {
  let opening: Promise<WorkerDatabase> | undefined
  const database = () =>
    (opening ??= open().catch((cause: unknown) => {
      // A cached rejection would wedge the store for good. Let the next call retry.
      opening = undefined
      throw cause
    }))
  const offline = offlineFor?.(database) ?? unavailableOfflineManager(database)

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
    offlineOverview: () => offline.overview(),
    pinAlbum: (albumId) => offline.pinAlbum(albumId),
    unpinAlbum: (albumId) => offline.unpinAlbum(albumId),
    resumeOffline: () => offline.resume(),
    touchOfflineTrack: (trackId) => offline.touch(trackId),
    clearOffline: () => offline.clear(),
    previewSessionCommand: async (sessionId, command, commandId) =>
      (await database()).previewSessionCommand(sessionId, command, commandId),
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
    queueSessionCommand: async (session, command, commandId, expectedRevision) =>
      (await database()).queueSessionCommand(session, command, commandId, expectedRevision),
    queueListen: async (event) => (await database()).queueListen(event),
    terminate: () => undefined,
  }
}

function unavailableOfflineManager(
  database: () => Promise<WorkerDatabase>,
): OfflineDownloadManager {
  const overview = async (): Promise<OfflineOverview> => {
    const store = await database()
    const [allPins, media] = await Promise.all([store.offlinePins(), store.offlineMedia()])
    const pins = allPins.filter((pin) => pin.pinned !== false)
    return {
      available: false,
      albums: pins.map((pin) => ({
        albumId: pin.albumId,
        state: pin.lastError === undefined ? "downloading" : "failed",
        totalTracks: 0,
        readyTracks: media.filter((entry) => entry.albumIds.includes(pin.albumId)).length,
        bytes: media
          .filter((entry) => entry.albumIds.includes(pin.albumId))
          .reduce((total, entry) => total + entry.bytes, 0),
        ...(pin.lastError === undefined ? {} : { error: pin.lastError }),
      })),
      totalBytes: media.reduce((total, entry) => total + entry.bytes, 0),
    }
  }
  const clearWithinExclusive = async () => {
    const store = await database()
    for (const media of await store.offlineMedia()) await store.removeOfflineMedium(media.trackId)
    for (const pin of await store.offlinePins()) await store.removeOfflinePin(pin.albumId)
  }
  return {
    overview,
    async pinAlbum() {
      throw new Error("offline downloads require Cache Storage in a worker")
    },
    async unpinAlbum(albumId) {
      await (await database()).removeOfflinePin(albumId)
      return overview()
    },
    resume: overview,
    async touch(trackId) {
      await (await database()).touchOfflineMedium(trackId)
    },
    clear: clearWithinExclusive,
    settle: overview,
    exclusive: async (operation) => operation(),
    clearWithinExclusive,
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
    offlineOverview: () => retry((client) => client.offlineOverview()),
    pinAlbum: (albumId) => retry((client) => client.pinAlbum(albumId)),
    unpinAlbum: (albumId) => retry((client) => client.unpinAlbum(albumId)),
    resumeOffline: () => retry((client) => client.resumeOffline()),
    touchOfflineTrack: (trackId) => retry((client) => client.touchOfflineTrack(trackId)),
    clearOffline: () => retry((client) => client.clearOffline()),
    previewSessionCommand: (sessionId, command, commandId) =>
      retry((client) => client.previewSessionCommand(sessionId, command, commandId)),
    sync: (origin) => retry((client) => client.sync(origin)),
    queuePlacement: (album, placement) =>
      retry((client) => client.queuePlacement(album, placement)),
    queueSessionCommand: (session, command, commandId, expectedRevision) =>
      retry((client) => client.queueSessionCommand(session, command, commandId, expectedRevision)),
    queueListen: (event) => retry((client) => client.queueListen(event)),
    terminate: () => active.terminate(),
  }
}

interface PendingStreamSwitch {
  readonly fromEpoch: number
  readonly transactionId: string
  readonly streamEpoch: number
  readonly accountId: string
  readonly deviceId: string
  readonly token: string
}

const PENDING_STREAM_SWITCH_PREFIX = "pyxis.pendingStreamSwitch."

function pendingKey(transactionId: string): string {
  return `${PENDING_STREAM_SWITCH_PREFIX}${transactionId}`
}

function savePendingStreamSwitch(pending: PendingStreamSwitch): void {
  try {
    globalThis.localStorage?.setItem(pendingKey(pending.transactionId), JSON.stringify(pending))
  } catch {
    // The live transaction still carries the token; this only protects tab-close recovery.
  }
}

function decodePendingStreamSwitch(stored: string): PendingStreamSwitch | undefined {
  try {
    const value: unknown = JSON.parse(stored)
    if (
      typeof value === "object" &&
      value !== null &&
      "fromEpoch" in value &&
      Number.isSafeInteger(value.fromEpoch) &&
      "streamEpoch" in value &&
      Number.isSafeInteger(value.streamEpoch) &&
      "transactionId" in value &&
      typeof value.transactionId === "string" &&
      "accountId" in value &&
      typeof value.accountId === "string" &&
      "deviceId" in value &&
      typeof value.deviceId === "string" &&
      "token" in value &&
      typeof value.token === "string"
    ) {
      return {
        fromEpoch: Number(value.fromEpoch),
        streamEpoch: Number(value.streamEpoch),
        transactionId: value.transactionId,
        accountId: value.accountId,
        deviceId: value.deviceId,
        token: value.token,
      }
    }
  } catch {
    // Corrupt recovery rows are removed by the enumerator.
  }
  return undefined
}

function pendingStreamSwitches(): readonly PendingStreamSwitch[] {
  const found: PendingStreamSwitch[] = []
  try {
    const storage = globalThis.localStorage
    if (storage === undefined) return found
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key === null || !key.startsWith(PENDING_STREAM_SWITCH_PREFIX)) continue
      const stored = storage.getItem(key)
      const pending = stored === null ? undefined : decodePendingStreamSwitch(stored)
      if (pending === undefined) storage.removeItem(key)
      else found.push(pending)
    }
  } catch {
    // Stream authorization remains fail-closed when recovery storage is unavailable.
  }
  return found
}

function clearPendingStreamSwitch(transactionId: string): void {
  try {
    globalThis.localStorage?.removeItem(pendingKey(transactionId))
  } catch {
    // Nothing else depends on localStorage cleanup.
  }
}

async function reconcilePendingStreamSwitch(settings: WorkerSettings): Promise<void> {
  const pending = pendingStreamSwitches()
  if (pending.length === 0) return
  const fence = await serviceWorkerStreamFence()
  for (const switchState of pending) {
    if ((settings.streamEpoch ?? 0) >= switchState.fromEpoch) {
      clearPendingStreamSwitch(switchState.transactionId)
      continue
    }
    if (
      fence.streamEpoch === switchState.fromEpoch &&
      fence.transactionId === switchState.transactionId
    ) {
      await rollbackServiceWorkerStreams(switchState)
      clearPendingStreamSwitch(switchState.transactionId)
      continue
    }
    if (
      fence.streamEpoch < switchState.fromEpoch ||
      fence.streamEpoch > switchState.fromEpoch ||
      fence.transactionId !== switchState.transactionId
    ) {
      // This transaction never owned the fence, or a newer transaction superseded it.
      clearPendingStreamSwitch(switchState.transactionId)
    }
  }
}

async function streamServiceWorker(): Promise<ServiceWorker | undefined> {
  const serviceWorkers = globalThis.navigator?.serviceWorker
  if (serviceWorkers === undefined) return undefined
  if (serviceWorkers.controller !== null) return serviceWorkers.controller
  try {
    const registration = await serviceWorkers.getRegistration("/")
    return registration?.active ?? registration?.waiting ?? undefined
  } catch {
    throw new Error("service worker registration could not be inspected")
  }
}

interface ServiceWorkerStreamFence {
  readonly streamEpoch: number
  readonly transactionId?: string
}

async function serviceWorkerStreamFence(): Promise<ServiceWorkerStreamFence> {
  const controller = await streamServiceWorker()
  if (controller === undefined || typeof MessageChannel === "undefined") {
    return { streamEpoch: 0 }
  }
  const channel = new MessageChannel()
  return new Promise<ServiceWorkerStreamFence>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("service worker stream fence timed out")),
      1000,
    )
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timeout)
      const value = event.data
      if (
        typeof value === "object" &&
        value !== null &&
        "streamEpoch" in value &&
        Number.isSafeInteger(value.streamEpoch)
      ) {
        resolve({
          streamEpoch: Number(value.streamEpoch),
          ...("transactionId" in value && typeof value.transactionId === "string"
            ? { transactionId: value.transactionId }
            : {}),
        })
      } else {
        reject(new Error("service worker stream fence is unavailable"))
      }
    }
    controller.postMessage({ _tag: "pyxis.stream.fence.read" }, [channel.port2])
  })
}

async function revokeServiceWorkerStreams(
  streamEpoch: number,
  transactionId: string,
): Promise<void> {
  const controller = await streamServiceWorker()
  if (controller === undefined || typeof MessageChannel === "undefined") return
  const channel = new MessageChannel()
  const revoked = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timeout)
      const value = event.data
      resolve(
        typeof value === "object" && value !== null && "revoked" in value && value.revoked === true,
      )
    }
    controller.postMessage({ _tag: "pyxis.stream.revoke", streamEpoch, transactionId }, [
      channel.port2,
    ])
  })
  if (!revoked) throw new Error("service worker did not revoke the previous stream account")
}

async function rollbackServiceWorkerStreams(message: {
  readonly fromEpoch: number
  readonly transactionId: string
  readonly streamEpoch: number
  readonly accountId: string
  readonly deviceId: string
  readonly token: string
}): Promise<void> {
  const controller = await streamServiceWorker()
  if (controller === undefined || typeof MessageChannel === "undefined") return
  const channel = new MessageChannel()
  const rolledBack = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timeout)
      const value = event.data
      resolve(
        typeof value === "object" &&
          value !== null &&
          "rolledBack" in value &&
          value.rolledBack === true,
      )
    }
    controller.postMessage({ _tag: "pyxis.stream.rollback", ...message }, [channel.port2])
  })
  if (!rolledBack) throw new Error("service worker did not restore the previous stream account")
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
