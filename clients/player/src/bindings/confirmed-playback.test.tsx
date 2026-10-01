import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { type RpcSessionCommand, RpcTransport } from "../../../../contracts/generated/pyxis"
import { playbackSource } from "../../test/playback-source"
import { AudioRenderer } from "./AudioRenderer.binding"
import { type PlaybackBinding, type PlaybackEdge, usePlayback } from "./usePlayback.binding"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function ConfirmedPlaybackProbe({
  edge,
  observe,
}: {
  readonly edge: PlaybackEdge
  readonly observe: (binding: PlaybackBinding) => void
}) {
  const binding = usePlayback(edge, { deviceId: "phone", positionReportIntervalMs: 0 })
  observe(binding)
  return <AudioRenderer playback={binding} />
}

test("a refused directive remains retryable and only confirmed Play enters durable state", async () => {
  const source = await playbackSource()
  let failSync = false
  let syncFailures = 0
  const edge: PlaybackEdge = {
    ...source.edge,
    syncSessions: async (...args) => {
      const report = await source.edge.syncSessions(...args)
      if (failSync) {
        syncFailures += 1
        throw new Error("session sync unavailable")
      }
      return report
    },
  }
  const initial = await source.worker.session("selected")
  if (initial === undefined) throw new Error("fixture session missing")
  await source.worker.queueSessionCommand(initial, {
    _tag: "queue.add",
    payload: { trackIds: ["track-1"] },
  })
  let refuses = true
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {
    if (refuses) throw new Error("autoplay refused")
  })
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  let binding: PlaybackBinding | undefined
  render(
    <ConfirmedPlaybackProbe
      edge={edge}
      observe={(next) => {
        binding = next
      }}
    />,
  )
  await waitFor(() => expect(binding?.playback.state).toBe("ready"))
  const directive = {
    sessionId: "selected",
    command: { _tag: "transport.play" as const, payload: {} },
    directiveId: "remote-play",
    issuedBy: "console",
  }
  act(() => binding?.applyDirective(directive))
  await waitFor(() => expect(play).toHaveBeenCalled())
  await waitFor(() =>
    expect(binding?.playback).toMatchObject({
      state: "unavailable",
      reason: { message: expect.stringContaining("autoplay refused") },
    }),
  )
  expect((await source.worker.session("selected"))?.transport).toBe(RpcTransport.Stopped)
  expect(source.sent).not.toContain("transport.play")

  for (const [index, command] of (
    [
      { _tag: "volume.set", payload: { volume: 70 } },
      { _tag: "position.report", payload: { positionMs: 5000 } },
      { _tag: "queue.add", payload: { trackIds: ["track-2"] } },
    ] satisfies RpcSessionCommand[]
  ).entries()) {
    const unrelated = {
      sessionId: "selected",
      command,
      directiveId: `unrelated-${index}`,
      issuedBy: "console",
    } as const
    act(() => binding?.applyDirective(unrelated))
    await waitFor(() => expect(source.sent).toContain(command._tag))
    await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
    await waitFor(() =>
      expect(binding?.playback).toMatchObject({
        state: "unavailable",
        reason: { message: expect.stringContaining("autoplay refused") },
      }),
    )
    act(() => binding?.applyDirective(unrelated))
    await act(async () => binding?.refresh())
    expect(binding?.playback).toMatchObject({
      state: "unavailable",
      reason: { message: expect.stringContaining("autoplay refused") },
    })
  }
  expect((await source.worker.session("selected"))?.transport).toBe(RpcTransport.Stopped)
  expect(play).toHaveBeenCalledTimes(1)
  failSync = true
  act(() => binding?.refresh())
  await waitFor(() => expect(syncFailures).toBeGreaterThan(0))
  expect(binding?.playback).toMatchObject({
    state: "unavailable",
    reason: { message: expect.stringContaining("autoplay refused") },
  })

  failSync = false
  refuses = false
  act(() => binding?.applyDirective(directive))
  await waitFor(() => expect(source.sent).toContain("transport.play"))
  expect(
    (
      await source.worker.previewSessionCommand(
        "selected",
        directive.command,
        directive.directiveId,
      )
    ).replayed,
  ).toBe(true)
  expect(play).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(binding?.playback.state).toBe("ready"))
})

test("a remote Clear waits for album replacement and leaves the selected session empty and stopped", async () => {
  const source = await playbackSource()
  let releaseClear = () => {}
  let clearHeld = false
  const edge: PlaybackEdge = {
    ...source.edge,
    queueSessionCommand: async (...args) => {
      if (args[1]._tag === "queue.clear" && !clearHeld) {
        clearHeld = true
        await new Promise<void>((resolve) => {
          releaseClear = resolve
        })
      }
      return source.worker.queueSessionCommand(...args)
    },
  }
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  let binding: PlaybackBinding | undefined
  render(
    <ConfirmedPlaybackProbe
      edge={edge}
      observe={(next) => {
        binding = next
      }}
    />,
  )
  source.subscribe((session) => binding?.applySession(session))
  await waitFor(() => expect(binding?.playback.state).toBe("ready"))
  act(() => binding?.playAlbum(["album-a"]))
  await waitFor(() => expect(clearHeld).toBe(true))
  await act(async () => {
    binding?.applyDirective({
      sessionId: "selected",
      command: { _tag: "queue.clear", payload: {} },
      directiveId: "remote-clear",
      issuedBy: "console",
    })
  })
  await act(async () => releaseClear())
  await waitFor(() =>
    expect(source.sent).toEqual(["queue.clear", "queue.add", "transport.play", "queue.clear"]),
  )
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
  expect(source.remote()).toMatchObject({ queue: [], transport: RpcTransport.Stopped })
  expect(await source.worker.session("selected")).toMatchObject({
    queue: [],
    transport: RpcTransport.Stopped,
  })
  await waitFor(() =>
    expect(binding?.playback).toMatchObject({
      state: "ready",
      value: { transport: "stopped", queueLength: 0 },
    }),
  )
})

test("a remote Pause interrupts an album's unconfirmed Play and keeps the selected album stopped", async () => {
  const source = await playbackSource()
  let release = (_url: string) => {}
  const edge: PlaybackEdge = {
    ...source.edge,
    loadStream: async (track) => {
      source.loads.push(track)
      return new Promise<string>((resolve) => {
        release = resolve
      })
    },
  }
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  let binding: PlaybackBinding | undefined
  render(
    <ConfirmedPlaybackProbe
      edge={edge}
      observe={(next) => {
        binding = next
      }}
    />,
  )
  source.subscribe((session) => binding?.applySession(session))
  await waitFor(() => expect(binding?.playback.state).toBe("ready"))
  act(() => binding?.playAlbum(["new-album"]))
  await waitFor(() => expect(source.loads).toEqual(["new-album"]))
  act(() =>
    binding?.applyDirective({
      sessionId: "selected",
      command: { _tag: "transport.pause", payload: {} },
      directiveId: "cancel",
      issuedBy: "console",
    }),
  )
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
  await waitFor(() => expect(source.remote().queue).toEqual(["new-album"]))
  expect((await source.worker.session("selected"))?.transport).toBe(RpcTransport.Stopped)
  expect(source.sent).toEqual(["queue.clear", "queue.add"])
  await expect(
    source.worker.previewSessionCommand(
      "selected",
      { _tag: "transport.pause", payload: {} },
      "cancel",
    ),
  ).rejects.toThrow("cannot pause unless playing")
  await act(async () => {
    release("/late-source")
    await Promise.resolve()
  })
  expect(play).not.toHaveBeenCalled()
  expect((await source.worker.session("selected"))?.transport).toBe(RpcTransport.Stopped)
})

test("later media failure survives receipt-only Play redelivery until a renderer-confirmed retry", async () => {
  const source = await playbackSource()
  const initial = await source.worker.session("selected")
  if (initial === undefined) throw new Error("fixture session missing")
  await source.worker.queueSessionCommand(initial, {
    _tag: "queue.add",
    payload: { trackIds: ["track-1"] },
  })
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  let deliveries = 0
  const edge: PlaybackEdge = {
    ...source.edge,
    queueSessionCommand: async (...args) => {
      const next = await source.worker.queueSessionCommand(...args)
      if (args[2] === "successful-play") deliveries += 1
      return next
    },
  }
  let binding: PlaybackBinding | undefined
  const { container } = render(
    <ConfirmedPlaybackProbe
      edge={edge}
      observe={(next) => {
        binding = next
      }}
    />,
  )
  await waitFor(() => expect(binding?.playback.state).toBe("ready"))
  const directive = {
    sessionId: "selected",
    command: { _tag: "transport.play" as const, payload: {} },
    directiveId: "successful-play",
    issuedBy: "console",
  }
  act(() => binding?.applyDirective(directive))
  await waitFor(() => expect(source.remote().transport).toBe(RpcTransport.Playing))
  const audio = container.querySelector("audio")
  if (audio === null) throw new Error("fixture renderer missing")
  act(() => audio.dispatchEvent(new Event("error")))
  await waitFor(() => expect(source.remote().transport).toBe(RpcTransport.Paused))
  await waitFor(() =>
    expect(binding?.playback).toMatchObject({
      state: "unavailable",
      reason: { message: expect.stringContaining("Audio renderer failed") },
      last: { transport: "paused" },
    }),
  )
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
  act(() => binding?.applyDirective(directive))
  await waitFor(() => expect(deliveries).toBe(2))
  expect(play).toHaveBeenCalledTimes(1)
  expect(binding?.playback).toMatchObject({
    state: "unavailable",
    reason: { message: expect.stringContaining("Audio renderer failed") },
    last: { transport: "paused" },
  })
  act(() => binding?.play())
  await waitFor(() =>
    expect(binding?.playback).toMatchObject({ state: "ready", value: { transport: "playing" } }),
  )
})
