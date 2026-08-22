import type {
  ListenTrackEventInput,
  RealtimeEvent,
  RealtimeServerMessage,
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcPlacement,
  RpcPlugin,
  RpcRequest,
  RpcResponse,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"

export interface RealtimeHandlers {
  onEvent(event: RealtimeEvent): void
  /// A console asked this device to change one of its sessions.
  onDirective(directive: RpcSessionDirective): void
  /// The server could not replay what was missed. Local state may be stale and has to be
  /// refetched rather than patched.
  onResync(): void
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
  setAlbumPlacement(
    token: string,
    albumId: string,
    placement: RpcPlacement,
  ): Promise<RpcLibraryAlbum>
  search(token: string, query: string): Promise<SearchResult>
  /// Reachable sessions only, unless `includeUnreachable` asks the durable question.
  listSessions(token: string, includeUnreachable?: boolean): Promise<readonly RpcSession[]>
  createSession(token: string, name: string): Promise<RpcSession>
  command(token: string, sessionId: string, command: RpcSessionCommand): Promise<RpcSession>
  /// Ask the device hosting `sessionId` to run a command. Resolves once the core has
  /// routed it; the resulting state arrives as a realtime event.
  sendCommand(token: string, sessionId: string, command: RpcSessionCommand): Promise<void>
  handoff(token: string, sessionId: string, targetSessionId: string): Promise<RpcSession>
  connectRealtime(token: string, handlers: RealtimeHandlers): () => void
  appendListen(token: string, event: ListenTrackEventInput): Promise<void>
  loadStream(token: string, trackId: string): Promise<string>
}

interface ReferenceClientConfig {
  readonly fetch?: typeof fetch
  readonly createObjectUrl?: (blob: Blob) => string
  readonly realtimeUrl?: string
}

export function createReferenceClient(config: ReferenceClientConfig = {}): ReferenceClient {
  const request = config.fetch ?? globalThis.fetch
  const createObjectUrl = config.createObjectUrl ?? URL.createObjectURL
  const realtimeUrl = config.realtimeUrl ?? defaultRealtimeUrl()

  const rpc = async (payload: RpcRequest, bearer?: string): Promise<RpcResponse> => {
    const response = await request("/rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify(payload),
    })
    const value: unknown = await response.json()
    if (!isRecord(value) || typeof value._tag !== "string" || !isRecord(value.outcome)) {
      throw new Error("RPC returned an invalid response envelope")
    }
    if (value._tag === "rpc.failure") {
      const failure = isRecord(value.outcome.value) ? value.outcome.value.message : undefined
      throw new Error(typeof failure === "string" ? failure : "RPC request was rejected")
    }
    if (value._tag !== payload._tag) {
      throw new Error(`RPC response tag '${value._tag}' did not match '${payload._tag}'`)
    }
    return value as RpcResponse
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

    async command(token, sessionId, command) {
      const response = await rpc(
        {
          _tag: "session.command.run",
          payload: { sessionId, command },
        },
        token,
      )
      if (response._tag !== "session.command.run" || response.outcome.status !== "applied") {
        const status = response._tag === "session.command.run" ? response.outcome.status : "invalid"
        throw new Error(`session command was not applied: ${status}`)
      }
      return response.outcome.value
    },

    async sendCommand(token, sessionId, command) {
      const response = await rpc(
        { _tag: "session.command.send", payload: { sessionId, command } },
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

    connectRealtime(token, handlers) {
      let closed = false
      let socket: WebSocket | undefined
      let retry: ReturnType<typeof setTimeout> | undefined
      // Kept across reconnects so a brief drop replays instead of losing state.
      let resumeToken: string | undefined

      const open = () => {
        if (closed) return
        socket = new WebSocket(realtimeUrl)
        socket.addEventListener("open", () => {
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
          let parsed: unknown
          try {
            parsed = JSON.parse(message.data)
          } catch {
            // A truncated frame is not worth tearing the socket down for.
            return
          }
          if (!isRecord(parsed) || typeof parsed._tag !== "string") return
          const frame = parsed as RealtimeServerMessage
          if (frame._tag === "realtime.welcome") {
            resumeToken = frame.payload.resumeToken
            // Either the replay was incomplete or this is a fresh epoch after a restart.
            // Patching from here would leave the client permanently stale.
            if (frame.payload.missedEventsDropped) handlers.onResync()
            return
          }
          if (frame._tag === "realtime.event") {
            resumeToken = frame.payload.resumeToken
            handlers.onEvent(frame.payload)
            return
          }
          if (frame._tag === "realtime.command") handlers.onDirective(frame.payload)
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

    async loadStream(token, trackId) {
      const response = await request(`/stream/${encodeURIComponent(trackId)}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`stream request failed with HTTP ${response.status}`)
      }
      return createObjectUrl(await response.blob())
    },
  }
}

function defaultRealtimeUrl(): string {
  const location = globalThis.location
  if (location === undefined) return "ws://127.0.0.1:4488/realtime"
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/realtime`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
