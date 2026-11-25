import {
  type RealtimeClientMessage,
  RPC_CONTRACT_ID,
  RpcRealtimeTopic,
} from "../../../../contracts/generated/pyxis"
import { isRealtimeServerMessage } from "../../../../contracts/validation"
import { PyxisError } from "../pyxis-client"

// Resolve only once Pyxis has accepted the token and attached the sessions topic.
export function watchSessions(
  base: URL,
  bearerToken: string,
  signal: AbortSignal,
  updated: (id: string, revision?: number) => void,
  ended: () => void,
): Promise<void> {
  const url = new URL("/realtime", base)
  url.protocol = base.protocol === "https:" ? "wss:" : "ws:"
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const socket = new WebSocket(url)
    const revisions = new Map<string, number>()
    let welcomed = false,
      closed = false
    const stop = (error?: PyxisError) => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      socket.close()
      if (!welcomed) reject(error ?? new Error("No realtime welcome from Pyxis"))
      ended()
    }
    const abort = () => stop()
    const timer = setTimeout(abort, 8000)
    signal.addEventListener("abort", abort, { once: true })
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          _tag: "realtime.hello",
          payload: {
            bearerToken,
            contractId: RPC_CONTRACT_ID,
            topics: [RpcRealtimeTopic.Sessions],
            sessionRetirements: true,
          },
        } satisfies RealtimeClientMessage),
      )
    }
    socket.onmessage = ({ data }) => {
      try {
        const frame: unknown = JSON.parse(data)
        if (!isRealtimeServerMessage(frame)) return stop()
        if (frame._tag === "realtime.failure") return stop(new PyxisError(frame.payload))
        if (!welcomed) {
          if (
            frame._tag !== "realtime.welcome" ||
            frame.payload.contractId !== RPC_CONTRACT_ID ||
            !frame.payload.topics.includes(RpcRealtimeTopic.Sessions)
          )
            return stop()
          welcomed = true
          clearTimeout(timer)
          resolve()
        } else if (frame._tag === "realtime.event") {
          const { state } = frame.payload
          if (state._tag === "session.retired") {
            revisions.delete(state.payload.id)
            updated(state.payload.id)
            return
          }
          if (state._tag !== "session.state") return
          const { id, revision } = state.payload
          if (revision > (revisions.get(id) ?? -1)) {
            revisions.set(id, revision)
            updated(id, revision)
          }
        }
      } catch {
        stop()
      }
    }
    socket.onclose = abort
    socket.onerror = abort
  })
}
