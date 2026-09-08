import { describe, expect, it } from "vitest"
import { type RpcSession, RpcTransport } from "../../../../contracts/generated/pyxis"
import { currentPlayback, playedFraction, readSession } from "./playback"

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "Living Room",
  hostDeviceId: "device-1",
  queue: [],
  transport: RpcTransport.Stopped,
  positionMs: 0,
  volume: 50,
  reachable: true,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
})

describe("an album ending is a resting state, not a transient", () => {
  it("keeps ended distinct from stopped and asks to be continued", () => {
    const view = readSession(session({ transport: RpcTransport.Ended }))
    expect(view.transport).toBe("ended")
    expect(view.awaitingContinue).toBe(true)
  })

  it("does not ask to continue while merely stopped", () => {
    expect(readSession(session({ transport: RpcTransport.Stopped })).awaitingContinue).toBe(false)
  })

  it("does not ask to continue while playing", () => {
    expect(readSession(session({ transport: RpcTransport.Playing })).awaitingContinue).toBe(false)
  })
})

describe("an unreachable host offers no working controls", () => {
  it("reports a paused unreachable session as not controllable", () => {
    const view = readSession(session({ transport: RpcTransport.Paused, reachable: false }))
    expect(view.transport).toBe("paused")
    expect(view.controllable).toBe(false)
  })

  it("reports a reachable session as controllable", () => {
    expect(readSession(session({ reachable: true })).controllable).toBe(true)
  })
})

describe("queue neighbours are derived from the cursor, not guessed", () => {
  it("reports no neighbours when nothing is cued", () => {
    const view = readSession(session({ queue: ["a", "b"] }))
    expect(view.hasNext).toBe(false)
    expect(view.hasPrevious).toBe(false)
  })

  it("reports a next track in the middle of a queue", () => {
    const view = readSession(session({ queue: ["a", "b", "c"], cursor: 1 }))
    expect(view.hasPrevious).toBe(true)
    expect(view.hasNext).toBe(true)
  })

  it("reports no next track at the end of a queue", () => {
    const view = readSession(session({ queue: ["a", "b"], cursor: 1 }))
    expect(view.hasNext).toBe(false)
    expect(view.hasPrevious).toBe(true)
  })
})

describe("progress is not reported confidently for an unknown duration", () => {
  it("returns nothing when the duration is unknown", () => {
    expect(playedFraction(readSession(session({ positionMs: 5000 })))).toBeUndefined()
  })

  it("returns nothing for a zero duration rather than dividing by it", () => {
    expect(playedFraction(readSession(session({ positionMs: 0, durationMs: 0 })))).toBeUndefined()
  })

  it("returns a bounded fraction", () => {
    expect(playedFraction(readSession(session({ positionMs: 5000, durationMs: 10_000 })))).toBe(0.5)
    expect(playedFraction(readSession(session({ positionMs: 99_000, durationMs: 10_000 })))).toBe(1)
  })
})

describe("choosing which session this device shows", () => {
  it("returns nothing when there are no sessions", () => {
    expect(currentPlayback([], "device-1")).toBeUndefined()
  })

  it("prefers the session hosted by this device", () => {
    const chosen = currentPlayback(
      [
        session({ id: "remote", hostDeviceId: "other" }),
        session({ id: "here", hostDeviceId: "device-1" }),
      ],
      "device-1",
    )
    expect(chosen?.sessionId).toBe("here")
  })

  it("falls back to a reachable session elsewhere", () => {
    const chosen = currentPlayback(
      [
        session({ id: "dead", hostDeviceId: "a", reachable: false }),
        session({ id: "alive", hostDeviceId: "b", reachable: true }),
      ],
      "device-1",
    )
    expect(chosen?.sessionId).toBe("alive")
  })

  it("still shows an unreachable session rather than hiding the room", () => {
    const chosen = currentPlayback(
      [session({ id: "dead", hostDeviceId: "a", reachable: false })],
      "device-1",
    )
    expect(chosen?.sessionId).toBe("dead")
    expect(chosen?.controllable).toBe(false)
  })
})
