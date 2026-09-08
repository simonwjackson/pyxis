import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import {
  type ListenTrackEventInput,
  type RpcSession,
  type RpcSessionCommand,
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

/// Applies just enough of a command to keep the fake session coherent. Deliberately does
/// not advance on `transport.trackEnded`: that is the core's decision, and a fake that
/// advanced would hide the very behaviour these tests exist to protect.
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
    case "transport.play":
      return { ...next, transport: RpcTransport.Playing }
    case "transport.pause":
      return { ...next, transport: RpcTransport.Paused }
    case "transport.trackEnded":
      return { ...next, transport: RpcTransport.Ended }
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

function Probe({ edge }: { readonly edge: PlaybackEdge }) {
  const playback = usePlayback(edge, { deviceId: "device-1", newEventId: () => "event-1" })
  const view = playback.playback.state === "ready" ? playback.playback.value : undefined
  return (
    <div>
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

test("a finished track is recorded and nothing else is started", async () => {
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

  // The whole point. Ending a track must not queue, jump or start anything: an album that
  // runs out leaves silence until a person asks for more.
  expect(
    fake.commands.filter((command) =>
      ["queue.add", "cursor.jump", "transport.play"].includes(command._tag),
    ),
  ).toEqual([])
  expect(fake.loads).toEqual(["track-1"])
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
