import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import {
  type ListenTrackEventInput,
  type RpcSession,
  type RpcSessionCommand,
  type RpcSessionDirective,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { AudioRenderer } from "./AudioRenderer.binding.tsx"
import { type PlaybackEdge, usePlayback } from "./usePlayback.binding.tsx"

afterEach(cleanup)

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "Here",
  hostDeviceId: "device-1",
  queue: ["track-1", "track-2"],
  cursor: 0,
  currentTrackId: "track-1",
  streamPath: "/stream/track-1",
  transport: RpcTransport.Playing,
  positionMs: 0,
  volume: 100,
  reachable: true,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
})

/// Applies just enough of a command to keep the fake session coherent.
///
/// `transport.trackEnded` mirrors the core: the cursor moves while the queue still has
/// something on it, and only an exhausted queue reaches `Ended`. The client must never make
/// that choice itself, but it does have to follow it, and a fake that always ended hid the
/// fact that it never did -- an album played its first track and then stopped.
function apply(current: RpcSession, command: RpcSessionCommand): RpcSession {
  const next = { ...current, revision: current.revision + 1 }
  switch (command._tag) {
    case "queue.clear": {
      // Omitted rather than set to undefined: an empty queue has no cursor at all.
      const { cursor: _cursor, currentTrackId: _track, ...rest } = next
      return { ...rest, queue: [] }
    }
    case "queue.add": {
      const queue = [...next.queue, ...command.payload.trackIds]
      const first = queue[0]
      return {
        ...next,
        queue,
        cursor: 0,
        ...(first === undefined ? {} : { currentTrackId: first }),
      }
    }
    case "cursor.jump": {
      // Mirrors the core: choosing a track and starting it are separate decisions there, so
      // a jump stops. A fake that kept playing would let a skip that never plays look fine.
      const track = next.queue[command.payload.index]
      return {
        ...next,
        cursor: command.payload.index,
        transport: RpcTransport.Stopped,
        positionMs: 0,
        ...(track === undefined ? {} : { currentTrackId: track }),
      }
    }
    case "transport.play":
      return { ...next, transport: RpcTransport.Playing }
    case "transport.pause":
      return { ...next, transport: RpcTransport.Paused }
    case "transport.trackEnded": {
      const at = next.cursor === undefined ? undefined : next.cursor + 1
      if (at === undefined || at >= next.queue.length)
        return { ...next, transport: RpcTransport.Ended, positionMs: 0 }
      const track = next.queue[at]
      return {
        ...next,
        cursor: at,
        positionMs: 0,
        ...(track === undefined ? {} : { currentTrackId: track }),
      }
    }
    case "position.report":
      return { ...next, positionMs: command.payload.positionMs }
    default:
      return next
  }
}

interface Harness {
  readonly edge: PlaybackEdge
  readonly commands: RpcSessionCommand[]
  readonly listens: ListenTrackEventInput[]
  readonly loads: string[]
  /// Resolves held loads newest-first, which is how a slow earlier request ends up landing
  /// after a newer one. Resolving in request order would hide that hazard entirely.
  releaseStream(): void
  setSession(next: RpcSession): void
}

function harness(initial: RpcSession, options: { holdStream?: boolean } = {}): Harness {
  let current = initial
  const commands: RpcSessionCommand[] = []
  const listens: ListenTrackEventInput[] = []
  const loads: string[] = []
  const held: (() => void)[] = []
  const edge: PlaybackEdge = {
    sessions: async () => [current],
    queueSessionCommand: async (target, command) => {
      commands.push(command)
      current = apply(target, command)
      return current
    },
    queueListen: async (event) => {
      listens.push(event)
    },
    touchOfflineTrack: async () => undefined,
    syncSessions: async () => ({ offline: false, authRequired: false, deferred: 0 }),
    loadStream: async (trackId) => {
      loads.push(trackId)
      if (options.holdStream === true) {
        await new Promise<void>((resolve) => {
          held.push(resolve)
        })
      }
      return `/stream/${trackId}`
    },
    ensureSession: async () => current,
  }
  return {
    edge,
    commands,
    listens,
    loads,
    releaseStream: () => {
      while (held.length > 0) held.pop()?.()
    },
    setSession: (next) => {
      current = next
    },
  }
}

function Probe({
  edge,
  pushed,
  directive,
}: {
  readonly edge: PlaybackEdge
  /// A session record as the realtime socket would hand it over.
  readonly pushed?: RpcSession
  readonly directive?: RpcSessionDirective
}) {
  const playback = usePlayback(edge, { deviceId: "device-1", newEventId: () => "event-1" })
  const view = playback.playback.state === "ready" ? playback.playback.value : undefined
  return (
    <div>
      <button type="button" onClick={() => pushed !== undefined && playback.applySession(pushed)}>
        Push session
      </button>
      <button
        type="button"
        onClick={() => directive !== undefined && playback.applyDirective(directive)}
      >
        Obey
      </button>
      <button type="button" onClick={() => playback.playAlbum(["track-9"])}>
        Play album
      </button>
      <button type="button" onClick={playback.pause}>
        Pause
      </button>
      <button type="button" onClick={playback.play}>
        Play
      </button>
      <button type="button" onClick={playback.refresh}>
        Refresh
      </button>
      <span data-testid="transport">{view?.transport ?? "none"}</span>
      <span data-testid="awaiting">{String(view?.awaitingContinue ?? false)}</span>
      <AudioRenderer playback={playback} />
    </div>
  )
}

const audioOf = (container: HTMLElement) => {
  const audio = container.querySelector("audio")
  if (audio === null) throw new Error("no audio element rendered")
  return audio
}

test("a re-render does not reload the stream", async () => {
  const fake = harness(session())
  const { container } = render(<Probe edge={fake.edge} />)

  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))
  expect(audioOf(container).getAttribute("src")).toBe("/stream/track-1")

  // Re-read the session several times. The track has not changed, so the network must not
  // be touched again: reloading would swap `src` and restart the track from zero.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("playing"))
  }

  expect(fake.loads).toEqual(["track-1"])
})

test("a second request for the same track does not swap the source mid-play", async () => {
  // The genuine race: a slow stream is still resolving when the listener pauses and starts
  // again. Without a guard the second resolution swaps `src` out from under audio that is
  // already playing, which restarts the track from zero.
  const fake = harness(session(), { holdStream: true })
  render(<Probe edge={fake.edge} />)

  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))
  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("paused"))
  fireEvent.click(screen.getByRole("button", { name: "Play" }))
  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("playing"))

  await act(async () => {
    fake.releaseStream()
    await Promise.resolve()
  })

  expect(fake.loads).toEqual(["track-1"])
})

test("a slow load for the previous track cannot overwrite the current one", async () => {
  const fake = harness(session(), { holdStream: true })
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  // The queue moves on while the first stream is still resolving.
  fake.setSession(session({ cursor: 1, currentTrackId: "track-2", revision: 2 }))
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() => expect(fake.loads).toEqual(["track-1", "track-2"]))

  // Newest resolves first, then the stale one. The stale answer must be discarded rather
  // than winning by arriving last.
  await act(async () => {
    fake.releaseStream()
    await Promise.resolve()
  })

  await waitFor(() => expect(audioOf(container).getAttribute("src")).toBe("/stream/track-2"))
})

test("a finished track is recorded, and the next one follows the core", async () => {
  // Two tracks, cursor on the first. Silence belongs at the end of a record, not between its
  // tracks, so this must carry on -- but only because the core moved the cursor.
  const fake = harness(session({ positionMs: 0 }))
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  const audio = audioOf(container)
  audio.currentTime = 210
  await act(async () => {
    fireEvent.ended(audio)
    await Promise.resolve()
  })

  await waitFor(() => expect(fake.listens).toHaveLength(1))
  expect(fake.listens[0]).toMatchObject({
    trackId: "track-1",
    deviceId: "device-1",
    completed: true,
    context: "queue",
    contextId: "session-1",
    playedMs: 210_000,
  })
  await waitFor(() =>
    expect(fake.commands.some((command) => command._tag === "transport.trackEnded")).toBe(true),
  )

  // It follows, and it does not decide: no queueing, no jumping, no starting. Every one of
  // those would be this client inventing a next track instead of reading one.
  expect(
    fake.commands.filter((command) =>
      ["queue.add", "cursor.jump", "transport.play"].includes(command._tag),
    ),
  ).toEqual([])
  await waitFor(() => expect(fake.loads).toEqual(["track-1", "track-2"]))
})

test("the last track running out leaves silence", async () => {
  // Cursor on the final track, so there is nothing to follow to. The album is over and the
  // device goes quiet until a person asks for more.
  const fake = harness(session({ positionMs: 0, cursor: 1, currentTrackId: "track-2" }))
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-2"]))

  await act(async () => {
    fireEvent.ended(audioOf(container))
    await Promise.resolve()
  })

  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("ended"))
  expect(screen.getByTestId("awaiting").textContent).toBe("true")
  expect(
    fake.commands.filter((command) =>
      ["queue.add", "cursor.jump", "transport.play"].includes(command._tag),
    ),
  ).toEqual([])
  // Nothing new was fetched: silence is the whole point.
  expect(fake.loads).toEqual(["track-2"])
})

test("an ended album offers to continue rather than continuing", async () => {
  const fake = harness(session({ transport: RpcTransport.Ended, queue: ["track-1"], cursor: 0 }))
  render(<Probe edge={fake.edge} />)

  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("ended"))
  expect(screen.getByTestId("awaiting").textContent).toBe("true")
  // Nothing was fetched and no command was sent. Silence is the resting state.
  expect(fake.loads).toEqual([])
  expect(fake.commands).toEqual([])
})

test("position is reported from the element, which is the only thing that knows it", async () => {
  const fake = harness(session())
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  audioOf(container).currentTime = 42.4
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))

  await waitFor(() =>
    expect(fake.commands).toContainEqual({
      _tag: "position.report",
      payload: { positionMs: 42_400 },
    }),
  )
})

/// A probe that reports on a short interval, so the periodic path can be exercised without
/// fake timers fighting the effects that resolve streams.
function TickingProbe({ edge }: { readonly edge: PlaybackEdge }) {
  const playback = usePlayback(edge, {
    deviceId: "device-1",
    newEventId: () => "event-1",
    positionReportIntervalMs: 20,
  })
  return (
    <div>
      <button type="button" onClick={playback.refresh}>
        Refresh
      </button>
      <AudioRenderer playback={playback} />
    </div>
  )
}

test("position keeps being reported while playing, not only when paused", async () => {
  // People leave; they do not pause. Reporting only on pause loses the position every time
  // a tab is closed, which is almost always.
  const fake = harness(session())
  const { container } = render(<TickingProbe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  audioOf(container).currentTime = 12
  await waitFor(() =>
    expect(fake.commands).toContainEqual({
      _tag: "position.report",
      payload: { positionMs: 12_000 },
    }),
  )

  // The second report carries the element's new position, so this is reading the element
  // each time rather than repeating a remembered number.
  audioOf(container).currentTime = 30
  await waitFor(() =>
    expect(fake.commands).toContainEqual({
      _tag: "position.report",
      payload: { positionMs: 30_000 },
    }),
  )
})

test("a paused session stops reporting instead of looking alive forever", async () => {
  // Starts playing so a real element exists with a real position. Starting paused proved
  // nothing: no stream loads when paused, so there was no element, so `currentTime ?? 0`
  // was zero and the zero-guard swallowed the report whether this rule existed or not.
  const fake = harness(session())
  const { container } = render(<TickingProbe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))
  audioOf(container).currentTime = 55
  await waitFor(() =>
    expect(fake.commands.some((command) => command._tag === "position.report")).toBe(true),
  )

  // Now the session is paused elsewhere. The element keeps its src and its currentTime, so
  // only the transport rule can stop the reports.
  fake.setSession(session({ transport: RpcTransport.Paused, positionMs: 55_000 }))
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() =>
    expect(
      fake.commands.filter((command) => command._tag === "position.report").length,
    ).toBeGreaterThan(0),
  )
  const settled = fake.commands.filter((command) => command._tag === "position.report").length

  await new Promise((resolve) => setTimeout(resolve, 80))

  // Four intervals would have elapsed. A paused session that keeps reporting looks alive
  // forever to every other device.
  expect(fake.commands.filter((command) => command._tag === "position.report").length).toBe(settled)
})

test("a position of zero is not reported as a rewind to the start", async () => {
  const fake = harness(session())
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  // An element that has not started reads zero. Reporting that would tell the core the
  // listener jumped back to the beginning, and a handoff would obey it.
  audioOf(container).currentTime = 0
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))

  await waitFor(() =>
    expect(fake.commands.some((command) => command._tag === "transport.pause")).toBe(true),
  )
  expect(fake.commands.some((command) => command._tag === "position.report")).toBe(false)
})

test("a resume seeks once and does not fight a later rewind", async () => {
  const fake = harness(session({ positionMs: 90_000 }))
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  const audio = audioOf(container)
  await waitFor(() => expect(audio.currentTime).toBe(90))

  // The listener rewinds. Later effect runs must leave that alone.
  audio.currentTime = 5
  for (let attempt = 0; attempt < 2; attempt += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("playing"))
  }

  expect(audio.currentTime).toBe(5)
})

test("playing an album replaces the queue rather than appending to it", async () => {
  const fake = harness(session({ transport: RpcTransport.Paused }))
  render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("paused"))

  fireEvent.click(screen.getByRole("button", { name: "Play album" }))

  await waitFor(() =>
    expect(fake.commands.map((command) => command._tag)).toEqual([
      "queue.clear",
      "queue.add",
      "transport.play",
    ]),
  )
})

test("an unreadable session says so instead of showing silence", async () => {
  const fake = harness(session())
  const failing: PlaybackEdge = {
    ...fake.edge,
    sessions: async () => {
      throw new Error("worker unavailable")
    },
  }
  render(<Probe edge={failing} />)

  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("none"))
  expect(fake.loads).toEqual([])
})

/// A session with nothing cued. The key is absent, not undefined, which is what the
/// contract actually means by "no current track".
const idleSession = (): RpcSession => {
  const { currentTrackId: _track, cursor: _cursor, ...rest } = session()
  return { ...rest, queue: [], transport: RpcTransport.Stopped }
}

test("the element is not rendered before a stream exists", () => {
  const fake = harness(idleSession())
  const { container } = render(<Probe edge={fake.edge} />)
  expect(container.querySelector("audio")).toBeNull()
})

test("jsdom cannot prove playback, so this states what it does prove", () => {
  // Guards the assumptions the tests above rest on. If jsdom ever implements playback these
  // fail loudly, which is the signal to replace the browser-only claims with real ones.
  const audio = document.createElement("audio")
  const play = vi.spyOn(audio, "play")
  expect(audio.play()).toBeUndefined()
  expect(play).toHaveBeenCalled()
  expect(audio.duration).toBeNaN()
  expect(audio.paused).toBe(true)
  // currentTime is a real property here, which is why the seek and position tests are
  // meaningful while "is sound coming out" is not testable at all.
  audio.currentTime = 7
  expect(audio.currentTime).toBe(7)
})

test("a session pushed by the core replaces what was held", async () => {
  const fake = harness(session())
  const advanced = session({ cursor: 1, currentTrackId: "track-2", revision: 2 })
  const { container } = render(<Probe edge={fake.edge} pushed={advanced} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  // Nothing asked for this. The core pushed it, which is the whole point: an album moving
  // to its next track has to reach the renderer without the renderer polling for it.
  fireEvent.click(screen.getByRole("button", { name: "Push session" }))

  await waitFor(() => expect(fake.loads).toEqual(["track-1", "track-2"]))
  expect(audioOf(container).getAttribute("src")).toBe("/stream/track-2")
})

test("a session hosted by another device is not taken", async () => {
  const fake = harness(session())
  // Every session on the account arrives on the sessions topic, including the one playing
  // in another room. This binding drives a real audio element, so taking that record would
  // put another room's track out of these speakers.
  const elsewhere = session({
    id: "session-2",
    hostDeviceId: "device-2",
    currentTrackId: "track-9",
    queue: ["track-9"],
  })
  render(<Probe edge={fake.edge} pushed={elsewhere} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  fireEvent.click(screen.getByRole("button", { name: "Push session" }))
  await act(async () => {
    await Promise.resolve()
  })

  expect(fake.loads).toEqual(["track-1"])
})

test("a console's directive is carried out once, however often it arrives", async () => {
  const fake = harness(session())
  const directive: RpcSessionDirective = {
    sessionId: "session-1",
    command: { _tag: "transport.pause", payload: {} },
    issuedBy: "device-2",
    directiveId: "directive-1",
  }
  render(<Probe edge={fake.edge} directive={directive} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  fireEvent.click(screen.getByRole("button", { name: "Obey" }))
  await waitFor(() =>
    expect(fake.commands.filter((command) => command._tag === "transport.pause")).toHaveLength(1),
  )

  // A socket that drops mid-delivery redelivers. Obeying twice would pause something a
  // person has since resumed, and for queue.add it would put the album in the queue twice.
  fireEvent.click(screen.getByRole("button", { name: "Obey" }))
  fireEvent.click(screen.getByRole("button", { name: "Obey" }))
  await act(async () => {
    await Promise.resolve()
  })

  expect(fake.commands.filter((command) => command._tag === "transport.pause")).toHaveLength(1)
})

test("skipping forward jumps and then plays, because a jump alone is silent", async () => {
  const fake = harness(session({ positionMs: 0 }))
  const { result } = renderHook(() => usePlayback(fake.edge, { deviceId: "device-1" }))
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  await act(async () => {
    result.current.next()
    await Promise.resolve()
  })

  // The core has no next command, only a cursor jump, and jumping deliberately stops. A
  // skip that forgot the play would leave a chosen track sitting silent.
  await waitFor(() =>
    expect(fake.commands.map((command) => command._tag)).toEqual(
      expect.arrayContaining(["cursor.jump", "transport.play"]),
    ),
  )
  const jump = fake.commands.find((command) => command._tag === "cursor.jump")
  expect(jump).toMatchObject({ payload: { index: 1 } })
  await waitFor(() => expect(fake.loads).toEqual(["track-1", "track-2"]))
})

test("skipping past either end of the queue asks for nothing", async () => {
  // The core rejects an index outside the queue, and the surface withholds the control
  // there, but the binding must not depend on the surface having done so.
  const fake = harness(session({ positionMs: 0, cursor: 1, currentTrackId: "track-2" }))
  const { result } = renderHook(() => usePlayback(fake.edge, { deviceId: "device-1" }))
  await waitFor(() => expect(fake.loads).toEqual(["track-2"]))
  const before = fake.commands.length

  await act(async () => {
    result.current.next()
    await Promise.resolve()
  })

  expect(fake.commands).toHaveLength(before)
})

test("tells the core how long the track is, as soon as the element knows", async () => {
  const fake = harness(session({ positionMs: 0 }))
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(container.querySelector("audio")).not.toBeNull())
  const audio = container.querySelector("audio") as HTMLAudioElement

  // jsdom decodes nothing, so `duration` is NaN forever and has to be stated. That makes
  // this a test of what is sent once a length is known, not of the length being learned.
  Object.defineProperty(audio, "duration", { value: 251, configurable: true })
  fireEvent.loadedMetadata(audio)

  // The core stores a duration and nothing ever sent one, so every track looked endless.
  await waitFor(() =>
    expect(
      fake.commands.find(
        (command) => command._tag === "position.report" && command.payload.durationMs !== undefined,
      ),
    ).toMatchObject({ payload: { durationMs: 251_000 } }),
  )
})

test("says nothing about a length it does not have", async () => {
  const fake = harness(session({ positionMs: 0 }))
  const { container } = render(<Probe edge={fake.edge} />)
  await waitFor(() => expect(container.querySelector("audio")).not.toBeNull())
  const audio = container.querySelector("audio") as HTMLAudioElement

  // A live stream reports Infinity and an undecoded file NaN. Neither is a length, and
  // sending either would have a dashboard draw a bar against nonsense.
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    Object.defineProperty(audio, "duration", { value, configurable: true })
    fireEvent.loadedMetadata(audio)
  }

  expect(fake.commands.filter((command) => command._tag === "position.report")).toHaveLength(0)
})
