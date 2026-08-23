import {
  ACCOUNT_ID_HEADER,
  DEVICE_ID_HEADER,
  OFFLINE_MAP_CACHE,
  OFFLINE_MEDIA_CACHE,
  OFFLINE_STAGING_CACHE,
  readMapping,
  STREAM_AUTH_CACHE,
  STREAM_FENCE_CACHE,
  streamMappingUrl,
} from "../worker/offline-cache"
import { offlineStreamResponse } from "./offline-response"
import { isShellAsset, SHELL_CACHE_PREFIX, shellCacheName } from "./shell"

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request
  readonly clientId: string
  respondWith(response: Promise<Response> | Response): void
}

interface MessageEventLike extends ExtendableEventLike {
  readonly data: unknown
  readonly source: { readonly id?: string } | null
  readonly ports: readonly MessagePort[]
}

interface ServiceWorkerScopeLike {
  readonly location: Location
  readonly clients: { claim(): Promise<void> }
  skipWaiting(): Promise<void>
  addEventListener(
    type: "install" | "activate",
    listener: (event: ExtendableEventLike) => void,
  ): void
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void
}

const worker = self as unknown as ServiceWorkerScopeLike
// Replaced in the built service-worker chunk by the Vite plugin. Binding the manifest to
// this source build prevents an old restarted worker from adopting a newer deployment's
// cache name and deleting the shell it actually installed.
const BUILT_ASSETS = JSON.parse("__PYXIS_ASSET_MANIFEST__") as readonly string[]
const SHELL_CACHE = shellCacheName(BUILT_ASSETS)
const SHELL_ASSETS = new Set(BUILT_ASSETS)
interface StreamCredentials {
  readonly token: string
  readonly accountId: string
  readonly deviceId: string
  readonly streamEpoch: number
}

interface StreamState {
  readonly streamEpoch: number
  readonly transactionId?: string
  readonly token?: string
  readonly accountId?: string
  readonly deviceId?: string
}

const STREAM_STATE_URL = new URL("/__pyxis/stream-auth/current", worker.location.origin).href
let streamState: StreamState | undefined
let streamStateChain: Promise<void> = Promise.resolve()

async function install(): Promise<void> {
  const cache = await caches.open(SHELL_CACHE)
  await cache.addAll(BUILT_ASSETS)
  await worker.skipWaiting()
}

async function activate(): Promise<void> {
  for (const name of await caches.keys()) {
    if (name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE) await caches.delete(name)
  }
  await worker.clients.claim()
}

async function cachedStream(request: Request): Promise<Response | undefined> {
  const [mapCache, mediaCache, stagingCache] = await Promise.all([
    caches.open(OFFLINE_MAP_CACHE),
    caches.open(OFFLINE_MEDIA_CACHE),
    caches.open(OFFLINE_STAGING_CACHE),
  ])
  return offlineStreamResponse(
    request,
    {
      match: async (key) => (await mapCache.match(key)) ?? undefined,
      put: async (key, response) => mapCache.put(key, response),
      delete: async (key) => mapCache.delete(key),
    },
    {
      match: async (key) => (await mediaCache.match(key)) ?? undefined,
      put: async (key, response) => mediaCache.put(key, response),
      delete: async (key) => mediaCache.delete(key),
    },
    {
      match: async (key) => (await stagingCache.match(key)) ?? undefined,
      put: async (key, response) => stagingCache.put(key, response),
      delete: async (key) => stagingCache.delete(key),
    },
  )
}

async function shellResponse(request: Request): Promise<Response> {
  // The update watcher explicitly asks for the deployed shell, not the cached one.
  if (request.cache === "no-store") return fetch(request)
  const url = new URL(request.url)
  if (request.mode === "navigate") {
    try {
      const response = await fetch(request)
      if (response.ok) return response
    } catch {
      // The cached shell is the entire point of this path.
    }
    try {
      const cache = await caches.open(SHELL_CACHE)
      const cached = (await cache.match("/")) ?? (await cache.match("/index.html"))
      if (cached !== undefined) return cached
    } catch {
      // Cache Storage can be blocked independently of the network.
    }
    return new Response("Pyxis is offline and its shell is unavailable.", { status: 503 })
  }
  if (isShellAsset(url.pathname, SHELL_ASSETS)) {
    try {
      const cached = await (await caches.open(SHELL_CACHE)).match(request)
      if (cached !== undefined) return cached
    } catch {
      // An online page must keep working when only Cache Storage is unavailable.
    }
  }
  return fetch(request)
}

async function decodeStreamState(response: Response | undefined): Promise<StreamState | undefined> {
  if (response === undefined) return undefined
  const value: unknown = await response.json()
  if (!isRecord(value) || !Number.isSafeInteger(value.streamEpoch)) {
    throw new Error("stream credential state is corrupt")
  }
  return {
    streamEpoch: Number(value.streamEpoch),
    ...(typeof value.transactionId === "string" ? { transactionId: value.transactionId } : {}),
    ...(typeof value.token === "string" ? { token: value.token } : {}),
    ...(typeof value.accountId === "string" ? { accountId: value.accountId } : {}),
    ...(typeof value.deviceId === "string" ? { deviceId: value.deviceId } : {}),
  }
}

async function loadStreamState(): Promise<StreamState> {
  if (streamState !== undefined) return streamState
  const [fenceCache, authCache] = await Promise.all([
    caches.open(STREAM_FENCE_CACHE),
    caches.open(STREAM_AUTH_CACHE),
  ])
  const [fence, authorized] = await Promise.all([
    decodeStreamState((await fenceCache.match(STREAM_STATE_URL)) ?? undefined),
    decodeStreamState((await authCache.match(STREAM_STATE_URL)) ?? undefined),
  ])
  if (fence === undefined && authorized === undefined) {
    streamState = { streamEpoch: 0 }
  } else if (fence === undefined) {
    throw new Error("stream credential fence is missing")
  } else if (authorized !== undefined && authorized.streamEpoch === fence.streamEpoch) {
    streamState = authorized
  } else {
    streamState = fence
  }
  if (streamState === undefined) throw new Error("stream credential fence is unavailable")
  return streamState
}

async function saveStreamState(state: StreamState): Promise<void> {
  const response = (value: StreamState) =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })
  const fence = {
    streamEpoch: state.streamEpoch,
    ...(state.transactionId === undefined ? {} : { transactionId: state.transactionId }),
  }
  await (await caches.open(STREAM_FENCE_CACHE)).put(STREAM_STATE_URL, response(fence))
  // Fence in memory as soon as the authoritative write lands. If the credential-cache
  // write fails, old credentials must not remain usable in this live worker.
  streamState = {
    streamEpoch: state.streamEpoch,
    ...(state.transactionId === undefined ? {} : { transactionId: state.transactionId }),
  }
  await (await caches.open(STREAM_AUTH_CACHE)).put(STREAM_STATE_URL, response(state))
  streamState = state
}

async function credentialsFor(request: Request): Promise<StreamCredentials | undefined> {
  const url = new URL(request.url)
  const accountId = url.searchParams.get("pyxisAccount")
  const deviceId = url.searchParams.get("pyxisDevice")
  const streamEpoch = Number(url.searchParams.get("pyxisEpoch"))
  if (accountId === null || deviceId === null || !Number.isSafeInteger(streamEpoch)) {
    return undefined
  }
  const state = await loadStreamState()
  if (
    state.streamEpoch !== streamEpoch ||
    state.token === undefined ||
    state.accountId !== accountId ||
    state.deviceId !== deviceId
  ) {
    return undefined
  }
  return { token: state.token, accountId, deviceId, streamEpoch }
}

function streamRequest(
  request: Request,
  credentials: StreamCredentials,
  includeAuthorization: boolean,
): Request {
  const headers = new Headers(request.headers)
  headers.set(ACCOUNT_ID_HEADER, credentials.accountId)
  headers.set(DEVICE_ID_HEADER, credentials.deviceId)
  if (includeAuthorization) headers.set("authorization", `Bearer ${credentials.token}`)
  // Media-element requests are no-cors guarded. Construct a fresh same-origin request so
  // Authorization and cache identity headers are legal and the original Range survives.
  return new Request(request.url, {
    method: "GET",
    headers,
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "follow",
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

worker.addEventListener("install", (event) => event.waitUntil(install()))
worker.addEventListener("activate", (event) => event.waitUntil(activate()))
worker.addEventListener("message", (event) => {
  const operation = streamStateChain.then(async () => {
    const message = event.data
    let reply: Record<string, unknown> = { authorized: false }
    if (
      event.source?.id !== undefined &&
      isRecord(message) &&
      message._tag === "pyxis.stream.fence.read"
    ) {
      try {
        const current = await loadStreamState()
        reply = {
          streamEpoch: current.streamEpoch,
          ...(current.transactionId === undefined ? {} : { transactionId: current.transactionId }),
        }
      } catch {
        // Fail closed: the caller refuses to guess an epoch.
      }
    } else if (
      event.source?.id !== undefined &&
      isRecord(message) &&
      message._tag === "pyxis.stream.revoke" &&
      Number.isSafeInteger(message.streamEpoch) &&
      typeof message.transactionId === "string"
    ) {
      try {
        const current = await loadStreamState()
        const streamEpoch = Number(message.streamEpoch)
        if (streamEpoch > current.streamEpoch) {
          await saveStreamState({ streamEpoch, transactionId: message.transactionId })
          reply = { revoked: true }
        } else if (
          streamEpoch === current.streamEpoch &&
          current.transactionId === message.transactionId
        ) {
          reply = { revoked: true }
        }
      } catch {
        // The account switch is refused when revocation cannot be persisted.
      }
    } else if (
      event.source?.id !== undefined &&
      isRecord(message) &&
      message._tag === "pyxis.stream.rollback" &&
      Number.isSafeInteger(message.fromEpoch) &&
      Number.isSafeInteger(message.streamEpoch) &&
      typeof message.transactionId === "string" &&
      typeof message.token === "string" &&
      typeof message.accountId === "string" &&
      typeof message.deviceId === "string"
    ) {
      try {
        const current = await loadStreamState()
        if (
          current.streamEpoch === Number(message.fromEpoch) &&
          current.transactionId === message.transactionId
        ) {
          await saveStreamState({
            streamEpoch: Number(message.streamEpoch),
            token: message.token,
            accountId: message.accountId,
            deviceId: message.deviceId,
          })
          reply = { rolledBack: true }
        }
      } catch {
        // The caller surfaces rollback failure with the original account-switch error.
      }
    } else if (
      event.source?.id !== undefined &&
      isRecord(message) &&
      message._tag === "pyxis.stream.authorize" &&
      typeof message.token === "string" &&
      typeof message.accountId === "string" &&
      typeof message.deviceId === "string" &&
      typeof message.trackId === "string" &&
      Number.isSafeInteger(message.streamEpoch)
    ) {
      const credentials: StreamCredentials = {
        token: message.token,
        accountId: message.accountId,
        deviceId: message.deviceId,
        streamEpoch: Number(message.streamEpoch),
      }
      try {
        const current = await loadStreamState()
        if (credentials.streamEpoch >= current.streamEpoch) {
          await saveStreamState(credentials)
          reply = { authorized: true }
          try {
            const mapping = await readMapping(
              (await (
                await caches.open(OFFLINE_MAP_CACHE)
              ).match(
                streamMappingUrl(
                  worker.location.origin,
                  credentials.accountId,
                  credentials.deviceId,
                  message.trackId,
                ),
              )) ?? undefined,
            )
            if (mapping !== undefined) reply = { authorized: true, ...mapping }
          } catch {
            // Online streaming still works without an offline candidate lease.
          }
        }
      } catch {
        // The page falls back to its authenticated fetch/object URL path.
      }
    }
    event.ports[0]?.postMessage(reply)
  })
  streamStateChain = operation.catch(() => undefined)
  event.waitUntil(operation)
})
worker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  const url = new URL(event.request.url)
  if (url.origin !== worker.location.origin) return
  if (
    url.pathname.startsWith("/stream/") &&
    !event.request.headers.has("x-pyxis-offline-refresh")
  ) {
    event.respondWith(
      (async () => {
        const credentials = await credentialsFor(event.request)
        const cacheRequest =
          credentials === undefined
            ? event.request
            : streamRequest(event.request, credentials, false)
        const networkRequest =
          credentials === undefined
            ? event.request
            : streamRequest(event.request, credentials, true)
        const cached =
          credentials === undefined
            ? undefined
            : await cachedStream(cacheRequest).catch(() => undefined)
        if (cached !== undefined) return cached
        if (url.searchParams.has("pyxisCandidate")) {
          // A leased playback URL must never splice a newly resolved encoding into later
          // range requests. The audio element reports the failure and the host corrects
          // public transport state to Paused.
          return new Response("leased offline candidate is unavailable", { status: 503 })
        }
        return fetch(networkRequest)
      })(),
    )
    return
  }
  event.respondWith(shellResponse(event.request))
})
