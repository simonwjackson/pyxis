import * as Option from "effect/Option"
import {
  type RpcSession,
  RpcTransport,
  type SessionHandoffOutcome,
  type SessionHandoffRequest,
} from "../../../../contracts/generated/pyxis"
import { RpcError } from "../rpc/client"
import type { createSupportRpc } from "../rpc/support"
import type { WorkerClient } from "./client"

export interface LeanBackClient {
  resumeForDevice(): Promise<Option.Option<RpcSession>>
  takeoverCandidates(): Promise<readonly RpcSession[]>
  handoff(request: SessionHandoffRequest): Promise<SessionHandoffOutcome>
}

function compareResumePriority(left: RpcSession, right: RpcSession): number {
  const playing =
    Number(right.transport === RpcTransport.Playing) -
    Number(left.transport === RpcTransport.Playing)
  if (playing !== 0) return playing
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1
  return left.id === right.id ? 0 : left.id < right.id ? 1 : -1
}

export function createLeanBackClient(
  worker: Pick<WorkerClient, "settings" | "sessions">,
  rpc?: ReturnType<typeof createSupportRpc>,
): LeanBackClient {
  // Loading the wire schema is not a prerequisite for an offline resume.
  const authenticatedRpc = async () => {
    const { deviceId, bearerToken } = await worker.settings()
    if (!deviceId || !bearerToken) throw new Error("a device grant is required for takeover")
    return {
      deviceId,
      bearerToken,
      call: rpc ?? (await import("../rpc/support")).createSupportRpc(),
    }
  }

  return {
    async resumeForDevice() {
      const { deviceId } = await worker.settings()
      if (!deviceId) return Option.none()
      const mine = (await worker.sessions()).filter((session) => session.hostDeviceId === deviceId)
      return Option.fromIterable(mine.sort(compareResumePriority))
    },
    async takeoverCandidates() {
      const { call, bearerToken, deviceId } = await authenticatedRpc()
      const { outcome } = await call<"session.list">(bearerToken, {
        _tag: "session.list",
        payload: {},
      })
      if (outcome.status !== "ready") {
        const { message, retryable, code } = outcome.value
        throw new RpcError(message, retryable, code)
      }
      return outcome.value.filter(
        (session) =>
          session.hostDeviceId !== deviceId &&
          session.output === undefined &&
          session.reachable &&
          (session.transport === RpcTransport.Playing || session.transport === RpcTransport.Paused),
      )
    },
    async handoff(payload) {
      const { call, bearerToken } = await authenticatedRpc()
      const { outcome } = await call<"session.handoff">(bearerToken, {
        _tag: "session.handoff",
        payload,
      })
      return outcome
    },
  }
}
