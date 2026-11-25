import {
  type RealtimeClientMessage,
  type RealtimeEvent,
  RPC_CONTRACT_ID,
  RpcRealtimeTopic,
} from "../../../../contracts/generated/pyxis"
import type { WorkerClient } from "./client"
import type { WorkerSessionEventResult } from "./contract"

export interface WorkerSessionFeed {
  hello(bearerToken: string, resumeToken?: string): RealtimeClientMessage
  apply(event: RealtimeEvent): Promise<WorkerSessionEventResult>
}

/// The host owns one socket (including directed commands). Use this hello on that
/// socket, and apply its session events in order before checkpointing their cursors.
export function workerSessionFeed(
  worker: Pick<WorkerClient, "applySessionEvent" | "applySessionRetirement">,
): WorkerSessionFeed {
  return {
    hello(bearerToken: string, resumeToken?: string): RealtimeClientMessage {
      return {
        _tag: "realtime.hello",
        payload: {
          bearerToken,
          contractId: RPC_CONTRACT_ID,
          topics: [RpcRealtimeTopic.Sessions],
          sessionRetirements: true,
          ...(resumeToken === undefined ? {} : { resumeToken }),
        },
      }
    },
    async apply({ state }: RealtimeEvent) {
      switch (state._tag) {
        case "session.retired":
          await worker.applySessionRetirement(state.payload.id)
          return { status: "retired" } as const
        case "session.state":
          return worker.applySessionEvent(state.payload)
        default:
          throw new Error("unexpected non-session event on session feed")
      }
    },
  }
}
