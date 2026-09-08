/// Holds the realtime socket open for the life of the page.
///
/// A binding, because it owns an external connection and its lifecycle. The behaviour worth
/// protecting is not "it connects" but that it does not lie about being connected and does
/// not thrash: the core counts this device present for exactly as long as one socket is
/// held, so reopening per render would make it flicker in and out of reachable, which is
/// worse than never connecting because it looks like it is working.

import { useEffect, useRef, useState } from "react"
import {
  RpcRealtimeTopic,
  type RpcSession,
  type RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import { connectRealtime, type RealtimeSocket } from "../rpc/realtime.ts"

export interface RealtimeEdge {
  readonly open: (url: string) => RealtimeSocket
  readonly url: string
}

export interface RealtimeCallbacks {
  readonly onSession?: (session: RpcSession) => void
  readonly onDirective?: (directive: RpcSessionDirective) => void
  readonly onResyncRequired?: () => void
  readonly onRefused?: (code: string, message: string) => void
  readonly schedule?: (run: () => void, afterMs: number) => () => void
}

export interface RealtimeBinding {
  /// True only while the core has welcomed the socket. Never optimistic: the interface uses
  /// this to decide whether it may offer controls at all, and a control that cannot reach
  /// its host is worse than no control.
  readonly connected: boolean
}

/// The edge is optional so a test can mount the shell without a socket, and so a build that
/// has no realtime transport degrades to "not present" rather than failing to render.
export function useRealtime(
  edge: RealtimeEdge | undefined,
  token: string | undefined,
  callbacks: RealtimeCallbacks = {},
): RealtimeBinding {
  const [connected, setConnected] = useState(false)

  /// Callbacks live in a ref so the connection does not depend on their identity. Callers
  /// naturally pass inline arrows, and a new arrow render must not cost a reconnect --
  /// that would drop and retake the core's presence refcount continuously.
  const latest = useRef(callbacks)
  latest.current = callbacks

  useEffect(() => {
    if (token === undefined || edge === undefined) {
      // Nothing to authenticate with, so nothing to try. Opening a socket that can only be
      // refused would earn a reconnect loop against a certain failure.
      setConnected(false)
      return
    }
    const schedule = latest.current.schedule
    const openSocket = edge.open
    return connectRealtime(
      {
        open: openSocket,
        url: edge.url,
        token,
        topics: [RpcRealtimeTopic.Sessions],
        ...(schedule === undefined ? {} : { schedule }),
      },
      {
        onReady: () => setConnected(true),
        onDropped: () => setConnected(false),
        onSession: (session) => latest.current.onSession?.(session),
        onDirective: (directive) => latest.current.onDirective?.(directive),
        onResyncRequired: () => latest.current.onResyncRequired?.(),
        onRefused: (code, message) => {
          setConnected(false)
          latest.current.onRefused?.(code, message)
        },
      },
    )
  }, [edge?.open, edge?.url, token])

  return { connected }
}
