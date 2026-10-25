import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import {
  type ListenTrackEventInput,
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
  type RpcSessionDirective,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { SESSION_CHANGED_DURING_CONFIRMATION } from "../../../app/src/worker/contract"
import { applySessionCommand } from "../../../app/src/worker/session-local"
import { renderPlayback as renderHook } from "../../test/render-playback"
import { AudioRenderer } from "./AudioRenderer.binding.tsx"
import { type PlaybackEdge, usePlayback } from "./usePlayback.binding.tsx"

afterEach(cleanup)

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "Here",
  hostDeviceId: "device-1",
  repeat: RpcRepeatMode.Off,
  shuffle: false,
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
  const receipts = new Map<string, string>()
  const edge: PlaybackEdge = {
    session: async (id) => (id === current.id ? current : undefined),
    previewSessionCommand: async (id, command, commandId) => {
      if (id !== current.id) throw new Error("unknown session")
      const prior = receipts.get(commandId)
      if (prior !== undefined && prior !== JSON.stringify(command))
        throw new Error("commandId conflict")
      if (prior === undefined) applySessionCommand(current, command)
      return { session: current, replayed: prior !== undefined }
    },
    sessions: async () => [current],
    applySessionEvent: async (next) => {
      if (next.revision >= current.revision) current = next
      return { status: "applied", session: current }
    },
    queueSessionCommand: async (_target, command, commandId, expectedRevision) => {
      if (commandId !== undefined && receipts.has(commandId)) return current
      if (expectedRevision !== undefined && current.revision !== expectedRevision)
        throw new Error(SESSION_CHANGED_DURING_CONFIRMATION)
      commands.push(command)
      current = applySessionCommand(current, command)
      if (commandId !== undefined) receipts.set(commandId, JSON.stringify(command))
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
      <button type="button" onClick={() => playback.seek(5000)}>
        Seek to five seconds
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

test("a cancelled load cannot replace the source after a confirmed retry", async () => {
  const source = harness(session(), { holdStream: true })
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  const { container } = render(<Probe edge={source.edge} />)

  await waitFor(() => expect(source.loads).toEqual(["track-1"]))
  fireEvent.click(screen.getByRole("button", { name: "Pause" }))
  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("paused"))
  fireEvent.click(screen.getByRole("button", { name: "Play" }))
  await waitFor(() => expect(source.loads).toHaveLength(2))
  expect(screen.getByTestId("transport").textContent).toBe("paused")
  expect(source.commands.some((command) => command._tag === "transport.play")).toBe(false)

  await act(async () => source.releaseStream())
  await waitFor(() => expect(screen.getByTestId("transport").textContent).toBe("playing"))
  expect(audioOf(container).getAttribute("src")).toBe("/stream/track-1")
  expect(play).toHaveBeenCalledTimes(1)
  play.mockRestore()
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
    repeat: RpcRepeatMode.Off,
    shuffle: false,
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

test("another session on this same device cannot take the speakers", async () => {
  // The real shape of the bug. A device hosts more than one session -- nothing prunes them,
  // so they pile up across launches -- and every one of them arrives on the sessions topic.
  // A gate that asked only "is this my device" said yes to all six, so each event loaded and
  // started a different album. From outside it sounded like records fighting each other.
  const fake = harness(session())
  const sibling = session({
    id: "session-7",
    hostDeviceId: "device-1",
    repeat: RpcRepeatMode.Off,
    shuffle: false,
    currentTrackId: "track-9",
    queue: ["track-9"],
  })
  render(<Probe edge={fake.edge} pushed={sibling} />)
  await waitFor(() => expect(fake.loads).toEqual(["track-1"]))

  fireEvent.click(screen.getByRole("button", { name: "Push session" }))
  await act(async () => {
    await Promise.resolve()
  })

  // The session being rendered is the gate, not the device hosting it.
  expect(fake.loads).toEqual(["track-1"])
})

test("refresh keeps the selected session when an older album's session is updated", async () => {
  const current = session()
  const sibling = session({
    id: "session-7",
    currentTrackId: "track-9",
    queue: ["track-9"],
    updatedAt: "2026-01-02T00:00:00Z",
  })
  const source = harness(current)
  let sessions = [current]
  const edge: PlaybackEdge = { ...source.edge, sessions: async () => sessions }
  const { result } = renderHook(() => usePlayback(edge, { deviceId: "device-1" }))
  await waitFor(() => expect(source.loads).toEqual(["track-1"]))

  sessions = [sibling, current]
  await act(async () => result.current.refresh())

  expect(source.loads).toEqual(["track-1"])
})

test("late session events cannot put a previously requested album back on the speakers", async () => {
  const source = harness(session())
  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "device-1" }))
  await waitFor(() => expect(source.loads).toEqual(["track-1"]))

  await act(async () => result.current.playAlbum(["track-9"]))
  await waitFor(() => expect(source.loads.at(-1)).toBe("track-9"))
  const settled = [...source.loads]

  await act(async () => result.current.applySession(session()))

  expect(source.loads).toEqual(settled)
})

test("a burst of session events renders the newest worker result", async () => {
  const source = harness(session())
  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "device-1" }))
  await waitFor(() => expect(source.loads).toEqual(["track-1"]))

  await act(async () => {
    result.current.applySession(session({ currentTrackId: "track-2", revision: 2 }))
    result.current.applySession(session({ currentTrackId: "track-3", revision: 3 }))
  })

  await waitFor(() => expect(source.loads.at(-1)).toBe("track-3"))
})

test("an unpaired device never renders another device's saved session", async () => {
  const source = harness(session())
  const { result } = renderHook(() => usePlayback(source.edge))
  await waitFor(() => expect(result.current.playback.state).toBe("ready"))
  expect(source.loads).toEqual([])
})

test("choosing an album keeps the selected session instead of bootstrapping a sibling", async () => {
  const source = harness(session())
  let bootstraps = 0
  const edge: PlaybackEdge = {
    ...source.edge,
    ensureSession: async () => {
      bootstraps += 1
      return session({ id: "sibling" })
    },
  }
  const { result } = renderHook(() => usePlayback(edge, { deviceId: "device-1" }))
  await waitFor(() => expect(source.loads).toEqual(["track-1"]))

  act(() => result.current.playAlbum(["track-9"]))

  await waitFor(() => expect(source.loads.at(-1)).toBe("track-9"))
  expect(bootstraps).toBe(0)
  expect(result.current.playback).toMatchObject({
    state: "ready",
    value: { sessionId: "session-1" },
  })
})

test("an offline album still loads while sync remains unavailable", async () => {
  const source = harness(session({ transport: RpcTransport.Paused }))
  const edge: PlaybackEdge = {
    ...source.edge,
    syncSessions: async () => ({ offline: true, authRequired: false, deferred: 3 }),
  }
  const { result } = renderHook(() => usePlayback(edge, { deviceId: "device-1" }))
  await waitFor(() => expect(result.current.playback.state).toBe("unavailable"))

  act(() => result.current.playAlbum(["track-9"]))

  await waitFor(() =>
    expect(result.current.playback).toMatchObject({
      state: "unavailable",
      reason: { kind: "offline" },
      last: { transport: "playing" },
    }),
  )
  await waitFor(() => expect(result.current.audioUrl).toBe("/stream/track-9"))
})

test("an offline duration report does not pause already loaded audio", async () => {
  const source = harness(session())
  let offline = false
  const edge: PlaybackEdge = {
    ...source.edge,
    syncSessions: async () => ({ offline, authRequired: false, deferred: 0 }),
  }
  const { result } = renderHook(() => usePlayback(edge, { deviceId: "device-1" }))
  await waitFor(() => expect(result.current.audioUrl).toBe("/stream/track-1"))
  const audio = document.createElement("audio")
  Object.defineProperty(audio, "duration", { value: 30 })
  const pause = vi.spyOn(audio, "pause")
  result.current.attachAudio(audio)
  offline = true

  act(() => result.current.reportDuration())

  await waitFor(() => expect(result.current.playback.state).toBe("unavailable"))
  expect(pause).not.toHaveBeenCalled()
})

test("the previous audio element cannot end the newly selected album while it loads", async () => {
  const source = harness(session())
  let release = (_url: string) => {}
  const edge: PlaybackEdge = {
    ...source.edge,
    loadStream: async (track) =>
      track === "track-9"
        ? new Promise<string>((resolve) => {
            release = resolve
          })
        : source.edge.loadStream(track),
  }
  const { container } = render(<Probe edge={edge} />)
  await waitFor(() => expect(audioOf(container).getAttribute("src")).toBe("/stream/track-1"))
  const previous = audioOf(container)
  fireEvent.click(screen.getByRole("button", { name: "Play album" }))
  await waitFor(() => expect(source.commands.at(-1)?._tag).toBe("queue.add"))
  expect(source.commands.some((command) => command._tag === "transport.play")).toBe(false)

  await act(async () => fireEvent.ended(previous))

  expect(source.commands.some((command) => command._tag === "transport.trackEnded")).toBe(false)
  expect(source.listens).toEqual([])
  await act(async () => release("/stream/track-9"))
})

test("product seeking records the shared confirmed seek intent, not a fabricated position report", async () => {
  const source = harness(session({ durationMs: 10000 }))
  const { container } = render(<Probe edge={source.edge} />)
  await waitFor(() => expect(source.loads).toEqual(["track-1"]))
  const audio = audioOf(container)
  Object.defineProperty(audio, "duration", { value: 10, configurable: true })
  fireEvent.click(screen.getByRole("button", { name: "Seek to five seconds" }))
  await waitFor(() =>
    expect(source.commands).toContainEqual({
      _tag: "transport.seek",
      payload: { positionMs: 5000 },
    }),
  )
  expect(audio.currentTime).toBe(5)
  expect(source.commands.some((command) => command._tag === "position.report")).toBe(false)
})

test.each([
  { mode: RpcRepeatMode.One, cursor: 0, track: "track-1", next: 1 },
  { mode: RpcRepeatMode.All, cursor: 1, track: "track-2", next: 0 },
])("explicit next is not trapped by $mode", async ({ mode, cursor, track, next }) => {
  const source = harness(session({ repeat: mode, cursor, currentTrackId: track }))
  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "device-1" }))
  await waitFor(() => expect(source.loads).toEqual([track]))
  act(() => result.current.next())
  await waitFor(() =>
    expect(source.commands).toContainEqual({ _tag: "cursor.jump", payload: { index: next } }),
  )
  await waitFor(() =>
    expect(source.commands.some((command) => command._tag === "transport.play")).toBe(true),
  )
})
