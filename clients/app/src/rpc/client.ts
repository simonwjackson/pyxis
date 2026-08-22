/// RPC for the worker.
///
/// The worker cannot share the page's validators, so it re-checks every shape it consumes
/// by hand. That is not duplication for its own sake: this code runs against whatever the
/// network returns, including a captive portal's HTML login page, and it has to reject
/// that rather than store it as a library.

import type {
  ListenTrackEventInput,
  RpcLibraryAlbum,
  RpcPlacement,
} from "../../../../contracts/generated/pyxis"

export class RpcError extends Error {
  constructor(
    message: string,
    /// Whether the caller should keep the write queued and try again later. Transport
    /// failures are retryable. A rejected payload never becomes valid by repeating it.
    readonly retryable: boolean,
    readonly code?: string,
    /// The credentials are the problem, not the request. Retrying changes nothing until
    /// they are fixed, but the write must survive: nobody loses their library edits
    /// because a token expired.
    readonly auth: boolean = false,
  ) {
    super(message)
    this.name = "RpcError"
  }
}

export interface WorkerRpc {
  listAlbums(): Promise<readonly RpcLibraryAlbum[]>
  setPlacement(albumId: string, placement: RpcPlacement): Promise<RpcLibraryAlbum | undefined>
  appendListen(
    events: readonly ListenTrackEventInput[],
  ): Promise<{ accepted: number; duplicates: number }>
}

export interface WorkerRpcConfig {
  readonly origin?: string
  readonly token: string
  readonly fetch?: typeof fetch
}

export function createWorkerRpc(config: WorkerRpcConfig): WorkerRpc {
  const request = config.fetch ?? globalThis.fetch
  const origin = config.origin ?? ""

  const call = async (body: unknown): Promise<Record<string, unknown>> => {
    let response: Response
    try {
      response = await request(`${origin}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new RpcError(cause instanceof Error ? cause.message : "network request failed", true)
    }

    // A proxy or captive portal answers with a status and a body that is not ours.
    if (!response.ok) {
      // 408 and 429 are the intermediary asking for patience, not a verdict on the
      // request. Treating them as permanent would throw away queued writes whenever a
      // proxy rate-limits a reconnect, which is exactly when the queue is longest.
      const transient = response.status >= 500 || response.status === 408 || response.status === 429
      const auth = response.status === 401 || response.status === 403
      throw new RpcError(`server returned HTTP ${response.status}`, transient, undefined, auth)
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      throw new RpcError("server response was not JSON", false)
    }
    if (!isRecord(parsed) || typeof parsed._tag !== "string" || !isRecord(parsed.outcome)) {
      throw new RpcError("server response was not an RPC envelope", false)
    }
    if (parsed._tag === "rpc.failure") {
      const failure = isRecord(parsed.outcome.value) ? parsed.outcome.value : {}
      const code = typeof failure.code === "string" ? failure.code : undefined
      throw new RpcError(
        typeof failure.message === "string" ? failure.message : "request was rejected",
        failure.retryable === true,
        code,
        code === "auth.invalidToken" || code === "auth.required",
      )
    }
    return parsed
  }

  const outcomeOf = (
    envelope: Record<string, unknown>,
    tag: string,
  ): { status: string; value: unknown } => {
    if (envelope._tag !== tag) {
      throw new RpcError(`server answered '${String(envelope._tag)}' for '${tag}'`, false)
    }
    const outcome = envelope.outcome as Record<string, unknown>
    if (typeof outcome.status !== "string") {
      throw new RpcError("outcome carried no status", false)
    }
    return { status: outcome.status, value: outcome.value }
  }

  return {
    async listAlbums() {
      const envelope = await call({ _tag: "library.albums.list", payload: {} })
      const outcome = outcomeOf(envelope, "library.albums.list")
      if (outcome.status !== "ready") throw failure(outcome, "library album list")
      if (!Array.isArray(outcome.value)) {
        throw new RpcError("album list was not an array", false)
      }
      return outcome.value.map(album)
    },

    async setPlacement(albumId, placement) {
      const envelope = await call({
        _tag: "library.album.command.run",
        payload: { albumId, command: { _tag: "placement.set", payload: { placement } } },
      })
      const outcome = outcomeOf(envelope, "library.album.command.run")
      // The album is gone. The caller decides what that means; it is not an error.
      if (outcome.status === "unknown") return undefined
      if (outcome.status !== "applied") throw failure(outcome, "placement change")
      return album(outcome.value)
    },

    async appendListen(events) {
      const envelope = await call({
        _tag: "listen.events.append",
        payload: { events },
      })
      const outcome = outcomeOf(envelope, "listen.events.append")
      if (outcome.status !== "ready") throw failure(outcome, "listen append")
      if (!isRecord(outcome.value)) throw new RpcError("listen result was not an object", false)
      const { accepted, duplicates } = outcome.value
      if (typeof accepted !== "number" || typeof duplicates !== "number") {
        throw new RpcError("listen result carried no counts", false)
      }
      return { accepted, duplicates }
    },
  }
}

function failure(outcome: { status: string; value: unknown }, what: string): RpcError {
  const value = isRecord(outcome.value) ? outcome.value : {}
  return new RpcError(
    typeof value.message === "string" ? value.message : `${what} was ${outcome.status}`,
    // Only the server may say a failure is worth repeating.
    value.retryable === true,
    typeof value.code === "string" ? value.code : outcome.status,
  )
}

/// Validate the fields sync actually depends on, and pass the rest through.
///
/// Checking every field would duplicate the contract and rot. Checking none would let a
/// wrong shape reach storage. These four are the ones merge rules read.
function album(value: unknown): RpcLibraryAlbum {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.revision !== "number" ||
    typeof value.placement !== "string" ||
    typeof value.placementUpdatedAt !== "string"
  ) {
    throw new RpcError("album was missing its identity, placement, or revision", false)
  }
  return value as unknown as RpcLibraryAlbum
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
