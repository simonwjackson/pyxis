/// The realtime socket.
///
/// Not a nicety for live updates. The core computes a session's `reachable` purely from an
/// open socket -- `attach_device` refcounts them, and the value is "never persisted and never
/// inferred from a past RPC call, so a crashed or sleeping host cannot leave a session
/// looking controllable". The interface withholds transport controls from a host it cannot
/// reach, so without this connection a device plays music nobody can tell it to pause, and
/// the missing controls are correct rather than a bug in the surface.
///
/// The socket factory is a parameter, not a global. That is what keeps this testable without
/// a browser and leaves the one reach for `WebSocket` in the composition root.

import type {
  RealtimeEvent,
  RealtimeWelcome,
  RpcFailure,
  RpcRealtimeTopic,
  RpcSession,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"

/// The part of `WebSocket` this needs. Narrow so a test can stand in for it honestly.
export interface RealtimeSocket {
  onopen: ((event: Event) => unknown) | null
  onmessage: ((event: MessageEvent) => unknown) | null
  onclose: ((event: CloseEvent) => unknown) | null
  onerror: ((event: Event) => unknown) | null
  send(data: string): void
  close(): void
}

export interface RealtimeTransport {
  readonly open: (url: string) => RealtimeSocket
  readonly url: string
  readonly token: string
  readonly topics: readonly RpcRealtimeTopic[]
  /// Returns its own canceller, so a pending reconnect can be called off without the caller
  /// tracking timer handles.
  readonly schedule?: (run: () => void, afterMs: number) => () => void
  /// Spreads reconnects out when a core comes back and every client wakes at once.
  readonly jitter?: () => number
}

export interface RealtimeHandlers {
  /// The core welcomed this socket. Only now is the device actually present.
  readonly onReady?: () => void
  readonly onDropped?: () => void
  /// A whole session record. Events carry complete records rather than deltas, so a client
  /// that misses one and refetches converges on the same value.
  readonly onSession?: (session: RpcSession) => void
  /// Another device is telling this host what to do. Console mode lives on this.
  readonly onDirective?: (directive: RpcSessionDirective) => void
  /// The replay window had been evicted, so held state is no longer trustworthy.
  readonly onResyncRequired?: () => void
  /// The core refused us for good. Retrying cannot help; a person has to act.
  readonly onRefused?: (code: string, message: string) => void
}

const BACKOFF_MS = [500, 1_000, 2_000, 5_000, 10_000] as const

/// A page on TLS opening `ws://` is blocked as mixed content, so the scheme is derived from
/// the page rather than fixed.
export function realtimeUrlFrom(origin: string): string {
  return `${origin.replace(/^http/, "ws")}/realtime`
}

export function connectRealtime(
  transport: RealtimeTransport,
  handlers: RealtimeHandlers = {},
): () => void {
  const {
    open,
    url,
    token,
    topics,
    schedule = (run, afterMs) => {
      const handle = setTimeout(run, afterMs)
      return () => clearTimeout(handle)
    },
    jitter = Math.random,
  } = transport

  let disposed = false
  let socket: RealtimeSocket | undefined
  let cancelRetry: (() => void) | undefined
  let attempt = 0
  /// Carried across reconnects so a brief drop replays instead of starting blank. Dropped
  /// whenever the core objects to it: its epoch changes on restart, and replaying from a
  /// point the core has just refused only earns the same refusal again.
  let resumeToken: string | undefined
  /// Set when the core refuses us permanently. Reconnecting against a revoked credential is
  /// an infinite loop against a door that will not open.
  let refused = false

  const retry = () => {
    if (disposed || refused) return
    const step = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 10_000
    attempt += 1
    cancelRetry = schedule(connect, Math.round(step * jitter()))
  }

  function connect() {
    if (disposed || refused) return
    let live: RealtimeSocket
    try {
      live = open(url)
    } catch {
      retry()
      return
    }
    socket = live

    live.onopen = () => {
      if (disposed) return
      live.send(
        JSON.stringify({
          _tag: "realtime.hello",
          // Omitted rather than sent as undefined: the core rejects unknown fields, and a
          // first connection has no cursor to resume from.
          payload: {
            bearerToken: token,
            topics,
            ...(resumeToken === undefined ? {} : { resumeToken }),
          },
        }),
      )
    }

    live.onmessage = (message) => {
      if (disposed) return
      let frame: { _tag?: unknown; payload?: unknown }
      try {
        frame = JSON.parse(String(message.data))
      } catch {
        // A malformed frame is the core's problem, not a reason to take the page down.
        return
      }
      if (frame._tag === "realtime.welcome") {
        const welcome = frame.payload as RealtimeWelcome
        resumeToken = welcome.resumeToken
        attempt = 0
        handlers.onReady?.()
        if (welcome.missedEventsDropped) handlers.onResyncRequired?.()
        return
      }
      if (frame._tag === "realtime.event") {
        const event = frame.payload as RealtimeEvent
        resumeToken = event.resumeToken
        if (event.state._tag === "session.state") handlers.onSession?.(event.state.payload)
        return
      }
      if (frame._tag === "realtime.command") {
        handlers.onDirective?.(frame.payload as RpcSessionDirective)
        return
      }
      if (frame._tag === "realtime.failure") {
        const failure = frame.payload as RpcFailure
        // Either way the cursor is suspect: the core is objecting to this connection.
        resumeToken = undefined
        if (failure.retryable === true) return
        refused = true
        handlers.onRefused?.(failure.code, failure.message)
      }
    }

    live.onclose = () => {
      if (disposed) return
      handlers.onDropped?.()
      retry()
    }
    live.onerror = () => {
      // `onclose` always follows, so reconnecting is decided in exactly one place.
      try {
        live.close()
      } catch {
        // Already going.
      }
    }
  }

  connect()

  return () => {
    if (disposed) return
    disposed = true
    cancelRetry?.()
    // The claim dies with the socket rather than outliving it. Announced here because the
    // close below is deliberate, and `onclose` is ignored once disposed so that a close the
    // disposer caused cannot schedule a return the caller just cancelled.
    handlers.onDropped?.()
    try {
      socket?.close()
    } catch {
      // Already closed.
    }
  }
}
