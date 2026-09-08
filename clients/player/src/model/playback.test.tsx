import { describe, expect, it } from "vitest"
import { type RpcSession, RpcTransport } from "../../../../contracts/generated/pyxis"
import { chooseLocalSession, currentPlayback, playedFraction, readSession } from "./playback"

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

describe("a device that hosts several sessions still renders exactly one", () => {
  // It hosts several because nothing prunes them: one device in real use had six. While the
  // rule was "first match in list order", three callers asked this same question and could
  // get three different answers, and every incoming event could change the answer again.
  // Each change loaded and started a different album.

  it("renders the one making sound", () => {
    const quiet = session({ id: "a", updatedAt: "2026-09-08T12:00:00Z" })
    const sounding = session({
      id: "b",
      transport: RpcTransport.Playing,
      updatedAt: "2026-09-08T09:00:00Z",
    })

    // Even though the quiet one was touched more recently. Whatever is audible right now is
    // unarguably the session this device is rendering.
    expect(chooseLocalSession([quiet, sounding], "device-1")?.id).toBe("b")
  })

  it("otherwise renders the one last touched", () => {
    const older = session({ id: "a", updatedAt: "2026-09-08T09:00:00Z" })
    const newer = session({ id: "b", updatedAt: "2026-09-08T12:00:00Z" })
    expect(chooseLocalSession([older, newer], "device-1")?.id).toBe("b")
  })

  it("gives the same answer however the list arrives", () => {
    // The rule was not wrong so much as unstable: the answer depended on order.
    const many = ["a", "b", "c", "d", "e", "f"].map((id, index) =>
      session({ id, updatedAt: `2026-09-08T1${index}:00:00Z` }),
    )
    const answers = new Set(
      [many, [...many].reverse(), [...many].sort((l, r) => l.id.localeCompare(r.id))].map(
        (order) => chooseLocalSession(order, "device-1")?.id,
      ),
    )
    expect(answers).toEqual(new Set(["f"]))
  })

  it("decides ties, so equal timestamps do not flip the answer", () => {
    const left = session({ id: "a" })
    const right = session({ id: "b" })
    expect(chooseLocalSession([left, right], "device-1")?.id).toBe("b")
    expect(chooseLocalSession([right, left], "device-1")?.id).toBe("b")
  })

  it("never renders another device's session", () => {
    const theirs = session({ id: "a", hostDeviceId: "device-2", transport: RpcTransport.Playing })
    expect(chooseLocalSession([theirs], "device-1")).toBeUndefined()
  })

  it("claims nothing when the device is unknown", () => {
    // Answering with someone else's session would be worse than answering with none.
    expect(chooseLocalSession([session()], undefined)).toBeUndefined()
  })
})
