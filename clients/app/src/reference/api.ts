import type {
  ListenTrackEventInput,
  RpcAuthGrant,
  RpcPlugin,
  RpcRequest,
  RpcResponse,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"

export interface SearchResult {
  readonly tracks: readonly RpcSearchTrack[]
  readonly noSources: boolean
  readonly failures: readonly string[]
}

export interface ReferenceClient {
  claimDevice(name: string): Promise<RpcAuthGrant>
  listPlugins(token: string): Promise<readonly RpcPlugin[]>
  search(token: string, query: string): Promise<SearchResult>
  listSessions(token: string): Promise<readonly RpcSession[]>
  createSession(token: string, name: string): Promise<RpcSession>
  command(token: string, sessionId: string, command: RpcSessionCommand): Promise<RpcSession>
  appendListen(token: string, event: ListenTrackEventInput): Promise<void>
  loadStream(token: string, trackId: string): Promise<string>
}

interface ReferenceClientConfig {
  readonly fetch?: typeof fetch
  readonly createObjectUrl?: (blob: Blob) => string
}

export function createReferenceClient(config: ReferenceClientConfig = {}): ReferenceClient {
  const request = config.fetch ?? globalThis.fetch
  const createObjectUrl = config.createObjectUrl ?? URL.createObjectURL

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

    async listSessions(token) {
      const response = await rpc({ _tag: "session.list", payload: {} }, token)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
