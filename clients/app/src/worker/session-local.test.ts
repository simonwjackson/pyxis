import { describe, expect, test } from "vitest"
import { RpcRepeatMode, type RpcSession, RpcTransport } from "../../../../contracts/generated/pyxis"
import { applySessionCommand } from "./session-local"

function session(overrides: Partial<RpcSession> = {}): RpcSession {
  return {
    id: "session-1",
    name: "Browser",
    hostDeviceId: "device-1",
    repeat: RpcRepeatMode.Off,
    shuffle: false,
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

test("shuffle restores duplicate occurrences and edits without moving playback", () => {
  let current = session({
    queue: ["a", "b", "a", "c", "d"],
    cursor: 2,
    currentTrackId: "a",
    transport: RpcTransport.Playing,
    positionMs: 42000,
    durationMs: 180000,
  })
  current = applySessionCommand(current, { _tag: "shuffle.set", payload: { enabled: true } })
  expect(current.queueOrder?.[current.cursor ?? -1]).toBe(2)
  current = applySessionCommand(current, { _tag: "queue.remove", payload: { index: 0 } })
  current = applySessionCommand(current, { _tag: "queue.add", payload: { trackIds: ["a", "e"] } })
  current = applySessionCommand(current, { _tag: "shuffle.set", payload: { enabled: false } })
  expect(current.queue).toEqual(["b", "a", "c", "d", "a", "e"])
  expect(current.cursor).toBe(1)
  expect(current.positionMs).toBe(42000)
  expect(current.durationMs).toBe(180000)
})

test("repeat modes distinguish natural completion from explicit skips", () => {
  const initial = session({
    queue: ["a", "b"],
    cursor: 0,
    currentTrackId: "a",
    transport: RpcTransport.Playing,
    positionMs: 4000,
    repeat: RpcRepeatMode.One,
  })
  const one = applySessionCommand(initial, { _tag: "transport.trackEnded", payload: {} })
  expect(one).toMatchObject({ cursor: 0, positionMs: 0, transport: RpcTransport.Playing })
  const skipped = applySessionCommand(one, { _tag: "cursor.jump", payload: { index: 1 } })
  expect(skipped).toMatchObject({ cursor: 1, currentTrackId: "b", repeat: RpcRepeatMode.One })
  const all = applySessionCommand(
    { ...initial, cursor: 1, currentTrackId: "b", repeat: RpcRepeatMode.All },
    { _tag: "transport.trackEnded", payload: {} },
  )
  expect(all).toMatchObject({ cursor: 0, transport: RpcTransport.Playing })
  const off = applySessionCommand(
    { ...initial, cursor: 1, currentTrackId: "b", repeat: RpcRepeatMode.Off },
    { _tag: "transport.trackEnded", payload: {} },
  )
  expect(off.transport).toBe(RpcTransport.Ended)
})

test("effective shuffle order matches the Rust wire vector", () => {
  const current = session({ queue: ["a", "b", "a", "c", "d", "e"], cursor: 1, currentTrackId: "b" })
  const shuffled = applySessionCommand(current, { _tag: "shuffle.set", payload: { enabled: true } })
  expect(shuffled.queueOrder).toEqual([0, 1, 5, 3, 4, 2])
  expect(shuffled.cursor).toBe(1)
})
