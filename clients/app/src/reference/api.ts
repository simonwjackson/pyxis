import type {
  ListenTrackEventInput,
  RealtimeEvent,
  RealtimeServerMessage,
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcOutputTopology,
  RpcPlacement,
  RpcPlugin,
  RpcRequest,
  RpcResponse,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import { assertRpcRequest, assertRpcResponse } from "../rpc/validation"

export interface RealtimeHandlers {
  onEvent(event: RealtimeEvent): void | Promise<void>
  /// A console asked this device to change one of its sessions.
  onDirective(directive: RpcSessionDirective): void
  /// Persist every cursor before the next page load.
  onResumeToken(resumeToken: string): void | Promise<void>
  /// The server could not replay what was missed. Local state may be stale and has to be
  /// refetched rather than patched.
  onResync(): void | Promise<void>
}

export interface SearchResult {
  readonly tracks: readonly RpcSearchTrack[]
  readonly noSources: boolean
  readonly failures: readonly string[]
}

export interface ReferenceClient {
  claimDevice(name: string): Promise<RpcAuthGrant>
  listPlugins(token: string): Promise<readonly RpcPlugin[]>
  listAlbums(token: string): Promise<readonly RpcLibraryAlbum[]>
  listOutputTargets(token: string, pluginId: string): Promise<RpcOutputTopology>
  createOutputSession(
    token: string,
    pluginId: string,
    targetId: string,
    name: string,
  ): Promise<RpcSession>
  setOutputGroup(
    token: string,
    pluginId: string,
    coordinatorId: string,
    memberIds: readonly string[],
  ): Promise<RpcOutputTopology>
  setAlbumPlacement(
    token: string,
    albumId: string,
    placement: RpcPlacement,
  ): Promise<RpcLibraryAlbum>
  search(token: string, query: string): Promise<SearchResult>
  /// Reachable sessions only, unless `includeUnreachable` asks the durable question.
  listSessions(token: string, includeUnreachable?: boolean): Promise<readonly RpcSession[]>
  createSession(token: string, name: string): Promise<RpcSession>
  command(
    token: string,
    sessionId: string,
    command: RpcSessionCommand,
    commandId?: string,
  ): Promise<RpcSession>
  /// Ask the device hosting `sessionId` to run a command. Resolves once the core has
  /// routed it; the resulting state arrives as a realtime event.
  sendCommand(
    token: string,
    sessionId: string,
    command: RpcSessionCommand,
    commandId?: string,
  ): Promise<void>
  handoff(token: string, sessionId: string, targetSessionId: string): Promise<RpcSession>
  connectRealtime(token: string, handlers: RealtimeHandlers, resumeToken?: string): () => void
  appendListen(token: string, event: ListenTrackEventInput): Promise<void>
  loadStream(
    token: string,
    trackId: string,
    identity?: {
      readonly accountId: string
      readonly deviceId: string
      readonly streamEpoch: number
    },
  ): Promise<string>
}

interface ReferenceClientConfig {
  readonly fetch?: typeof fetch
  readonly createObjectUrl?: (blob: Blob) => string
  readonly authorizeDirectStream?: (credentials: {
    readonly token: string
    readonly accountId: string
    readonly deviceId: string
    readonly streamEpoch: number
    readonly trackId: string
  }) => Promise<{ readonly candidateUrl?: string; readonly cacheName?: string } | undefined>
  readonly realtimeUrl?: string
  readonly createWebSocket?: (url: string) => WebSocket
}

export function createReferenceClient(config: ReferenceClientConfig = {}): ReferenceClient {
  const request = config.fetch ?? globalThis.fetch
  const createObjectUrl = config.createObjectUrl ?? URL.createObjectURL
  const authorizeDirectStream = config.authorizeDirectStream ?? authorizeServiceWorkerStream
  const realtimeUrl = config.realtimeUrl ?? defaultRealtimeUrl()
  const createWebSocket = config.createWebSocket ?? ((url: string) => new WebSocket(url))

  const rpc = async (payload: RpcRequest, bearer?: string): Promise<RpcResponse> => {
    assertRpcRequest(payload)
    const response = await request("/rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify(payload),
    })
    const value: unknown = await response.json()
    assertRpcResponse(value)
    if (value._tag === "rpc.failure") {
      const failure = isRecord(value.outcome.value) ? value.outcome.value.message : undefined
      throw new Error(typeof failure === "string" ? failure : "RPC request was rejected")
    }
    if (value._tag !== payload._tag) {
      throw new Error(`RPC response tag '${value._tag}' did not match '${payload._tag}'`)
    }
    return value
  }

  return {
    async claimDevice(name) {
      const response = await rpc({ _tag: "auth.device.claim", payload: { name } })
      if (response._tag !== "auth.device.claim" || response.outcome.status !== "ready") {
        throw new Error("device claim did not return a grant")
      }
      return response.outcome.value
    },

    async listPlugins(token) {
      const response = await rpc({ _tag: "plugin.list", payload: {} }, token)
      if (response._tag !== "plugin.list" || response.outcome.status !== "ready") {
        throw new Error("plugin list is unavailable")
      }
      return response.outcome.value
    },

    async listAlbums(token) {
      const response = await rpc({ _tag: "library.albums.list", payload: {} }, token)
      if (response._tag !== "library.albums.list" || response.outcome.status !== "ready") {
        throw new Error("library album list is unavailable")
      }
      return response.outcome.value
    },

    async listOutputTargets(token, pluginId) {
      const response = await rpc({ _tag: "output.targets.list", payload: { pluginId } }, token)
      if (response._tag !== "output.targets.list") {
        throw new Error("output target list returned an invalid response")
      }
      if (response.outcome.status !== "ready") {
        throw new Error(`${response.outcome.value.code}: ${response.outcome.value.message}`)
      }
      return response.outcome.value
    },

    async createOutputSession(token, pluginId, targetId, name) {
      const response = await rpc(
        { _tag: "output.session.create", payload: { pluginId, targetId, name } },
        token,
      )
      if (response._tag !== "output.session.create" || response.outcome.status !== "ready") {
        const status =
          response._tag === "output.session.create" ? response.outcome.status : "invalid"
        throw new Error(`output session was not created: ${status}`)
      }
      return response.outcome.value
    },

    async setOutputGroup(token, pluginId, coordinatorId, memberIds) {
      const response = await rpc(
        {
          _tag: "output.group.set",
          payload: { pluginId, coordinatorId, memberIds: [...memberIds] },
        },
        token,
      )
      if (response._tag !== "output.group.set" || response.outcome.status !== "ready") {
        throw new Error("output group was not updated")
      }
      return response.outcome.value
    },

    async setAlbumPlacement(token, albumId, placement) {
      const response = await rpc(
        {
          _tag: "library.album.command.run",
          payload: {
            albumId,
            command: { _tag: "placement.set", payload: { placement } },
          },
        },
        token,
      )
      if (response._tag !== "library.album.command.run" || response.outcome.status !== "applied") {
        throw new Error("album placement was not applied")
      }
      return response.outcome.value
    },

    async search(token, query) {
      const response = await rpc(
        { _tag: "source.search.run", payload: { query, limit: 10 } },
        token,
      )
      if (response._tag !== "source.search.run") throw new Error("invalid search response")
      if (response.outcome.status === "noSources") {
        return { tracks: [], noSources: true, failures: [] }
      }
      if (response.outcome.status !== "ready") throw new Error("source search is unavailable")
      return {
        tracks: response.outcome.value.tracks,
        noSources: false,
        failures: response.outcome.value.failures.map(
          (failure) => `${failure.pluginId}: ${failure.failure.message}`,
        ),
      }
    },

    async listSessions(token, includeUnreachable = false) {
      const response = await rpc({ _tag: "session.list", payload: { includeUnreachable } }, token)
      if (response._tag !== "session.list" || response.outcome.status !== "ready") {
        throw new Error("session list is unavailable")
      }
      return response.outcome.value
    },

    async createSession(token, name) {
      const response = await rpc({ _tag: "session.create", payload: { name } }, token)
      if (response._tag !== "session.create" || response.outcome.status !== "ready") {
        throw new Error("session could not be created")
      }
      return response.outcome.value
    },

    async command(token, sessionId, command, commandId) {
      const response = await rpc(
        {
          _tag: "session.command.run",
          payload: { sessionId, command, ...(commandId === undefined ? {} : { commandId }) },
        },
        token,
      )
      if (response._tag !== "session.command.run" || response.outcome.status !== "applied") {
        const status = response._tag === "session.command.run" ? response.outcome.status : "invalid"
        throw new Error(`session command was not applied: ${status}`)
      }
      return response.outcome.value
    },

    async sendCommand(token, sessionId, command, commandId) {
      const response = await rpc(
        {
          _tag: "session.command.send",
          payload: { sessionId, command, ...(commandId === undefined ? {} : { commandId }) },
        },
        token,
      )
      if (response._tag !== "session.command.send") throw new Error("invalid console response")
      if (response.outcome.status !== "dispatched") {
        throw new Error(`console command was not delivered: ${response.outcome.status}`)
      }
    },

    async handoff(token, sessionId, targetSessionId) {
      const response = await rpc(
        { _tag: "session.handoff", payload: { sessionId, targetSessionId } },
        token,
      )
      if (response._tag !== "session.handoff") throw new Error("invalid handoff response")
      if (response.outcome.status !== "ready") {
        throw new Error(`handoff was refused: ${response.outcome.status}`)
      }
      return response.outcome.value
    },

    connectRealtime(token, handlers, initialResumeToken) {
      let closed = false
      let socket: WebSocket | undefined
      let retry: ReturnType<typeof setTimeout> | undefined
      // Kept across reconnects and page loads so a brief drop replays instead of losing state.
      let resumeToken = initialResumeToken
      let helloHadResume = false
      let frames: Promise<void> = Promise.resolve()
      let frameFailed = false

      const open = () => {
        if (closed) return
        frames = Promise.resolve()
        frameFailed = false
        socket = createWebSocket(realtimeUrl)
        socket.addEventListener("open", () => {
          helloHadResume = resumeToken !== undefined
          socket?.send(
            JSON.stringify({
              _tag: "realtime.hello",
              payload: {
                bearerToken: token,
                topics: ["sessions", "library"],
                ...(resumeToken === undefined ? {} : { resumeToken }),
              },
            }),
          )
        })
        socket.addEventListener("message", (message: MessageEvent<string>) => {
          if (frameFailed) return
          frames = frames
            .then(async () => {
              let parsed: unknown
              try {
                parsed = JSON.parse(message.data)
              } catch {
                throw new Error("realtime frame was not JSON")
              }
              if (!isRecord(parsed) || typeof parsed._tag !== "string") {
                throw new Error("realtime frame was not an envelope")
              }
              const frame = parsed as RealtimeServerMessage
              if (frame._tag === "realtime.welcome") {
                const nextResumeToken = frame.payload.resumeToken
                // Persist a cursor only after the state it covers is durable.
                if (frame.payload.missedEventsDropped || !helloHadResume) {
                  await handlers.onResync()
                }
                await handlers.onResumeToken(nextResumeToken)
                resumeToken = nextResumeToken
                return
              }
              if (frame._tag === "realtime.event") {
                const nextResumeToken = frame.payload.resumeToken
                await handlers.onEvent(frame.payload)
                await handlers.onResumeToken(nextResumeToken)
                resumeToken = nextResumeToken
                return
              }
              if (frame._tag === "realtime.command") handlers.onDirective(frame.payload)
            })
            .catch(() => {
              // Keep the last committed cursor. Reconnect from there rather than letting a
              // later frame move past state this client did not store.
              frameFailed = true
              socket?.close()
            })
        })
        socket.addEventListener("close", () => {
          if (closed) return
          retry = setTimeout(open, 1000)
        })
      }

      open()
      return () => {
        closed = true
        if (retry !== undefined) clearTimeout(retry)
        socket?.close()
      }
    },

    async appendListen(token, event) {
      const response = await rpc(
        { _tag: "listen.events.append", payload: { events: [event] } },
        token,
      )
      if (response._tag !== "listen.events.append" || response.outcome.status !== "ready") {
        throw new Error("listen event was not accepted")
      }
    },

    async loadStream(token, trackId, identity) {
      const direct =
        identity === undefined
          ? undefined
          : await authorizeDirectStream({ token, trackId, ...identity }).catch(() => undefined)
      if (identity !== undefined && direct !== undefined) {
        const query = new URLSearchParams({
          pyxisAccount: identity.accountId,
          pyxisDevice: identity.deviceId,
          pyxisEpoch: String(identity.streamEpoch),
          ...(direct.candidateUrl === undefined ? {} : { pyxisCandidate: direct.candidateUrl }),
          ...(direct.cacheName === undefined ? {} : { pyxisCache: direct.cacheName }),
        })
        return `/stream/${encodeURIComponent(trackId)}?${query}`
      }
      const response = await request(`/stream/${encodeURIComponent(trackId)}`, {
        headers: {
          authorization: `Bearer ${token}`,
          ...(identity === undefined
            ? {}
            : {
                "x-pyxis-account-id": identity.accountId,
                "x-pyxis-device-id": identity.deviceId,
              }),
        },
      })
      if (!response.ok) {
        throw new Error(`stream request failed with HTTP ${response.status}`)
      }
      return createObjectUrl(await response.blob())
    },
  }
}

async function authorizeServiceWorkerStream(credentials: {
  readonly token: string
  readonly accountId: string
  readonly deviceId: string
  readonly streamEpoch: number
  readonly trackId: string
}): Promise<{ readonly candidateUrl?: string; readonly cacheName?: string } | undefined> {
  const controller = globalThis.navigator?.serviceWorker?.controller
  if (controller === null || controller === undefined || typeof MessageChannel === "undefined") {
    return undefined
  }
  const channel = new MessageChannel()
  return new Promise<{ readonly candidateUrl?: string; readonly cacheName?: string } | undefined>(
    (resolve) => {
      const timeout = setTimeout(() => resolve(undefined), 1000)
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timeout)
        const value = event.data
        resolve(
          isRecord(value) && value.authorized === true
            ? {
                ...(typeof value.candidateUrl === "string"
                  ? { candidateUrl: value.candidateUrl }
                  : {}),
                ...(typeof value.cacheName === "string" ? { cacheName: value.cacheName } : {}),
              }
            : undefined,
        )
      }
      controller.postMessage({ _tag: "pyxis.stream.authorize", ...credentials }, [channel.port2])
    },
  )
}

function defaultRealtimeUrl(): string {
  const location = globalThis.location
  if (location === undefined) return "ws://127.0.0.1:4488/realtime"
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/realtime`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
