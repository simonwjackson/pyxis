import { describe, expect, test } from "vitest"
import { type RpcSession, RpcTransport } from "../../../../contracts/generated/pyxis"
import { applySessionCommand } from "./session-local"

function session(overrides: Partial<RpcSession> = {}): RpcSession {
  return {
    id: "session-1",
    name: "Browser",
    hostDeviceId: "device-1",
    queue: [],
    transport: RpcTransport.Stopped,
    positionMs: 0,
    volume: 100,
    reachable: true,
    revision: 1,
    updatedAt: "before",
    ...overrides,
  }
}

describe("offline session commands", () => {
  test("adds tracks and selects the first one", () => {
    const updated = applySessionCommand(
      session(),
      { _tag: "queue.add", payload: { trackIds: ["track-1", "track-2"] } },
      "after",
    )

    expect(updated).toMatchObject({
      queue: ["track-1", "track-2"],
      cursor: 0,
      currentTrackId: "track-1",
      streamPath: "/stream/track-1",
      revision: 2,
      updatedAt: "after",
    })
  })

  test("clearing stops playback and removes the cursor", () => {
    const updated = applySessionCommand(
      session({
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
        positionMs: 12_000,
      }),
      { _tag: "queue.clear", payload: {} },
    )

    expect(updated.queue).toEqual([])
    expect(updated.cursor).toBeUndefined()
    expect(updated.currentTrackId).toBeUndefined()
    expect(updated.transport).toBe(RpcTransport.Stopped)
    expect(updated.positionMs).toBe(0)
  })

  test("removing before the cursor preserves the current track", () => {
    const updated = applySessionCommand(
      session({
        queue: ["track-1", "track-2", "track-3"],
        cursor: 2,
        currentTrackId: "track-3",
      }),
      { _tag: "queue.remove", payload: { index: 0 } },
    )

    expect(updated.queue).toEqual(["track-2", "track-3"])
    expect(updated.cursor).toBe(1)
    expect(updated.currentTrackId).toBe("track-3")
  })
})

describe("a track running out", () => {
  const playing = (overrides: Partial<RpcSession> = {}) =>
    session({
      queue: ["track-1", "track-2", "track-3"],
      cursor: 0,
      currentTrackId: "track-1",
      transport: RpcTransport.Playing,
      positionMs: 210_000,
      durationMs: 240_000,
      ...overrides,
    })

  test("moves to the next track and keeps playing", () => {
    // This projection is what the interface renders, so a copy that ends here ends every
    // album after one song regardless of what the core decides on reconnect.
    const updated = applySessionCommand(
      playing(),
      { _tag: "transport.trackEnded", payload: {} },
      "after",
    )

    expect(updated).toMatchObject({
      cursor: 1,
      currentTrackId: "track-2",
      streamPath: "/stream/track-2",
      transport: RpcTransport.Playing,
      positionMs: 0,
    })
    // The next track brings its own length.
    expect(updated.durationMs).toBeUndefined()
  })

  test("ends the album on the last track rather than wrapping around", () => {
    const updated = applySessionCommand(
      playing({ cursor: 2, currentTrackId: "track-3" }),
      { _tag: "transport.trackEnded", payload: {} },
      "after",
    )

    expect(updated).toMatchObject({
      cursor: 2,
      transport: RpcTransport.Ended,
      positionMs: 0,
    })
  })

  test("matches the core, which refuses to end a track that is not playing", () => {
    expect(() =>
      applySessionCommand(
        playing({ transport: RpcTransport.Paused }),
        { _tag: "transport.trackEnded", payload: {} },
        "after",
      ),
    ).toThrow()
  })
})
