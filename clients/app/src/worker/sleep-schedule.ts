import type { RpcSession, StopCommand } from "../../../../contracts/generated/pyxis"

export interface SleepStop {
  readonly command: {
    readonly _tag: "transport.stop"
    readonly payload: StopCommand & { sleepTimerId: string }
  }
  readonly commandId: string
  readonly restoreVolume: number
}

type Schedule =
  | { kind: "disarmed" }
  | { kind: "armed"; gain: number; remainingMs: number; fadeStartInMs: number; fadeMs: number }
  | ({ kind: "stop" } & SleepStop)

/** Pure wall-clock decision. Reevaluate on each worker snapshot, scheduled tick and wake. */
export function sleepSchedule(
  session: Pick<RpcSession, "sleepTimer" | "volume"> | undefined,
  nowMs = Date.now(),
): Schedule {
  const timer = session?.sleepTimer
  if (!timer || !session) return { kind: "disarmed" }
  const remainingMs = Date.parse(timer.deadline) - nowMs
  if (!Number.isFinite(remainingMs)) throw new Error("invalid sleep timer deadline")
  if (remainingMs <= 0)
    return {
      kind: "stop",
      command: { _tag: "transport.stop", payload: { sleepTimerId: timer.id } },
      commandId: `sleep:${timer.id}`,
      restoreVolume: session.volume,
    }
  const fadeMs = timer.fadeSeconds * 1000
  return {
    kind: "armed",
    remainingMs,
    fadeMs,
    fadeStartInMs: Math.max(0, remainingMs - fadeMs),
    gain: fadeMs === 0 ? 1 : Math.min(1, remainingMs / fadeMs),
  }
}
