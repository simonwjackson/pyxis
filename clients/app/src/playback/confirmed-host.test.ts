import { afterEach, expect, test, vi } from "vitest"
import {
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { createDirectWorkerClient } from "../worker/client"
import { createMemoryEngine, openWorkerDatabase } from "../worker/database"
import { createConfirmedPlaybackHost } from "./confirmed-host"

const play: RpcSessionCommand = { _tag: "transport.play", payload: {} }
const pause: RpcSessionCommand = { _tag: "transport.pause", payload: {} }
const hosts: ReturnType<typeof createConfirmedPlaybackHost>[] = []
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose()
})

function deferred<T>() {
  let resolve = (_value: T) => {}
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

async function fixture(
  options: {
    transport?: RpcTransport
    positionMs?: number
    attachImmediately?: boolean
    stream?: (track: string) => Promise<string>
    play?: () => Promise<void>
  } = {},
) {
  const database = await openWorkerDatabase({ engine: createMemoryEngine() })
  await database.writeSettings({ accountId: "account", deviceId: "phone" })
  let selected: RpcSession | undefined = {
    id: "selected",
    name: "Phone",
    hostDeviceId: "phone",
    repeat: RpcRepeatMode.Off,
    shuffle: false,
    queue: ["track"],
    cursor: 0,
    currentTrackId: "track",
    transport: options.transport ?? RpcTransport.Stopped,
    positionMs: options.positionMs ?? 0,
    volume: 50,
    reachable: true,
    revision: 1,
    updatedAt: "2026-09-30T00:00:00Z",
  }
  await database.putSession(selected)
  const worker = createDirectWorkerClient(async () => database)
  const loads: string[] = []
  const urls: (string | undefined)[] = []
  const failures: unknown[] = []
  const published: RpcSession[] = []
  let element: HTMLAudioElement | undefined
  let plays = 0
  let pauses = 0
  let syncs = 0
  let write: typeof worker.queueSessionCommand = (...args) => worker.queueSessionCommand(...args)
  let sequence = 0
  const ports = {
    store: {
      ...worker,
      queueSessionCommand: (...args: Parameters<typeof worker.queueSessionCommand>) =>
        write(...args),
    },
    selectedSession: () => selected,
    deviceId: () => "phone",
    loadStream: async (track: string) => {
      loads.push(track)
      return options.stream?.(track) ?? `/stream/${track}`
    },
    publishSession: (session: RpcSession) => {
      selected = session
      published.push(session)
    },
    publishAudioUrl: (url: string | undefined) => {
      urls.push(url)
      if (url === undefined) {
        host.attachAudio(null)
        element = undefined
        return
      }
      element = document.createElement("audio")
      element.setAttribute("src", url)
      element.play = async () => {
        plays += 1
        await options.play?.()
      }
      element.pause = () => {
        pauses += 1
      }
      if (options.attachImmediately !== false) host.attachAudio(element)
    },
    reportFailure: (cause: unknown) => {
      failures.push(cause)
    },
    requestSessionSync: () => {
      syncs += 1
    },
    newCommandId: () => `local-${++sequence}`,
  }
  let host = createConfirmedPlaybackHost(ports)
  hosts.push(host)
  return {
    database,
    worker,
    host,
    loads,
    urls,
    failures,
    published,
    media: () => element,
    plays: () => plays,
    pauses: () => pauses,
    syncs: () => syncs,
    setWrite: (next: typeof write) => {
      write = next
    },
    select: (next: RpcSession | undefined) => {
      selected = next
    },
    reopen: () => {
      host.dispose()
      host = createConfirmedPlaybackHost(ports)
      hosts.push(host)
      return host
    },
  }
}

test("Play is durable only after renderer confirmation", async () => {
  const started = deferred<void>()
  const source = await fixture({ play: () => started.promise })
  const pending = source.host.execute("selected", play, "play-1")
  await vi.waitFor(() => expect(source.plays()).toBe(1))
  expect((await source.database.session("selected"))?.transport).toBe(RpcTransport.Stopped)
  expect(await source.database.outbox()).toEqual([])
  started.resolve()
  expect(await pending).toMatchObject({
    _tag: "Applied",
    session: { transport: RpcTransport.Playing },
  })
  expect((await source.worker.previewSessionCommand("selected", play, "play-1")).replayed).toBe(
    true,
  )
  expect(source.plays()).toBe(1)
})

test("a durable receipt prevents a redelivered Play from restarting newer paused audio after reload", async () => {
  const source = await fixture()
  await source.host.execute("selected", play, "play-1")
  await source.host.execute("selected", pause, "pause-1")
  const played = source.plays()
  await source.reopen().applyDirective({
    sessionId: "selected",
    command: play,
    directiveId: "play-1",
    issuedBy: "console",
  })
  expect(source.plays()).toBe(played)
  expect((await source.database.session("selected"))?.transport).toBe(RpcTransport.Paused)
})

test("a failed durable Play rolls audio back and remains retryable under the same command identity", async () => {
  const source = await fixture()
  source.setWrite(async () => {
    throw new Error("quota exceeded")
  })
  await expect(source.host.execute("selected", play, "play-1")).rejects.toThrow("quota exceeded")
  expect(source.pauses()).toBeGreaterThan(0)
  expect((await source.worker.previewSessionCommand("selected", play, "play-1")).replayed).toBe(
    false,
  )
  expect(await source.database.outbox()).toEqual([])
  source.setWrite((...args) => source.worker.queueSessionCommand(...args))
  expect(await source.host.execute("selected", play, "play-1")).toMatchObject({ _tag: "Applied" })
})

test.each([RpcTransport.Stopped, RpcTransport.Paused])(
  "Pause cancels an unconfirmed Play from %s without inventing transport or a receipt",
  async (transport) => {
    const stream = deferred<string>()
    const source = await fixture({ transport, stream: () => stream.promise })
    const pending = source.host.execute("selected", play, "play-1")
    await vi.waitFor(() => expect(source.loads).toEqual(["track"]))
    expect(await source.host.execute("selected", pause, "cancel-1")).toMatchObject({
      _tag: "Cancelled",
      session: { transport },
    })
    expect(await pending).toMatchObject({ _tag: "Cancelled", session: { transport } })
    expect(await source.database.outbox()).toEqual([])
    await expect(
      source.worker.previewSessionCommand("selected", pause, "cancel-1"),
    ).rejects.toThrow("cannot pause unless playing")
    stream.resolve("/late-source")
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(source.urls).toEqual([])
    expect(source.plays()).toBe(0)
    expect((await source.database.session("selected"))?.transport).toBe(transport)
  },
)

test("Pause during automatic loading of durable Playing commits a normal durable receipt", async () => {
  const stream = deferred<string>()
  const source = await fixture({ transport: RpcTransport.Playing, stream: () => stream.promise })
  source.host.renderSession(await source.database.session("selected"))
  await vi.waitFor(() => expect(source.loads).toEqual(["track"]))
  expect(await source.host.execute("selected", pause, "pause-1")).toMatchObject({
    _tag: "Applied",
    session: { transport: RpcTransport.Paused },
  })
  expect((await source.worker.previewSessionCommand("selected", pause, "pause-1")).replayed).toBe(
    true,
  )
  stream.resolve("/late-source")
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  expect(source.plays()).toBe(0)
})

test("invalid commands and command-content conflicts fail before renderer effects", async () => {
  const source = await fixture()
  await expect(source.host.execute("sibling", play)).rejects.toMatchObject({ name: "AbortError" })
  await expect(
    source.host.execute("selected", { _tag: "cursor.jump", payload: { index: 9 } }),
  ).rejects.toThrow("outside the queue")
  const selected = await source.database.session("selected")
  if (selected === undefined) throw new Error("fixture session missing")
  await source.worker.queueSessionCommand(
    selected,
    { _tag: "volume.set", payload: { volume: 60 } },
    "reserved",
  )
  await expect(source.host.execute("selected", play, "reserved")).rejects.toThrow(
    "different session command",
  )
  expect(source.loads).toEqual([])
  expect(source.plays()).toBe(0)
  expect(source.pauses()).toBe(0)
})

test("a directive for a no-longer-owned session rejects through its promised outcome", async () => {
  const source = await fixture()
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("fixture session is missing")
  source.select({ ...current, hostDeviceId: "other-host" })
  const delivery = source.host.applyDirective({
    sessionId: "selected",
    command: play,
    directiveId: "stale-directive",
    issuedBy: "console",
  })
  await expect(delivery).rejects.toMatchObject({ name: "AbortError" })
  expect(source.loads).toEqual([])
  expect(await source.database.outbox()).toEqual([])
})

test("conflicting content cannot borrow an in-flight directive's identity", async () => {
  const stream = deferred<string>()
  const source = await fixture({ stream: () => stream.promise })
  const pending = source.host.applyDirective({
    sessionId: "selected",
    command: play,
    directiveId: "in-flight",
    issuedBy: "console",
  })
  await vi.waitFor(() => expect(source.loads).toEqual(["track"]))
  await expect(
    source.host.applyDirective({
      sessionId: "selected",
      command: pause,
      directiveId: "in-flight",
      issuedBy: "console",
    }),
  ).rejects.toThrow("different session command")
  stream.resolve("/confirmed-source")
  expect(await pending).toMatchObject({
    _tag: "Applied",
    session: { transport: RpcTransport.Playing },
  })
  expect(source.plays()).toBe(1)
})

test("an error during the Play commit immediately records corrective Pause", async () => {
  const committed = deferred<void>()
  const source = await fixture()
  source.setWrite(async (...args) => {
    if (args[1]._tag === "transport.play") await committed.promise
    return source.worker.queueSessionCommand(...args)
  })
  const pending = source.host.execute("selected", play)
  await vi.waitFor(() => expect(source.plays()).toBe(1))
  source.media()?.dispatchEvent(new Event("error"))
  committed.resolve()
  expect(await pending).toMatchObject({
    _tag: "Applied",
    session: { transport: RpcTransport.Paused },
  })
  expect(
    (await source.database.outbox()).map((entry) =>
      entry.kind === "session.command" ? entry.command._tag : entry.kind,
    ),
  ).toEqual(["transport.play", "transport.pause"])
  expect(source.failures).toHaveLength(1)
})

test.each([RpcTransport.Stopped, RpcTransport.Paused])(
  "Pause during a pending Play write restores prior %s after the write completes",
  async (transport) => {
    const entered = deferred<void>()
    const commit = deferred<void>()
    const source = await fixture({ transport })
    source.setWrite(async (...args) => {
      if (args[1]._tag === "transport.play") {
        entered.resolve()
        await commit.promise
      }
      return source.worker.queueSessionCommand(...args)
    })
    const pending = source.host.execute("selected", play, "play-1")
    await entered.promise
    expect((await source.database.session("selected"))?.transport).toBe(transport)
    expect(await source.host.execute("selected", pause, "cancel-write")).toMatchObject({
      _tag: "Cancelled",
      session: { transport },
    })
    commit.resolve()
    expect(await pending).toMatchObject({ _tag: "Cancelled", session: { transport } })
    expect((await source.database.session("selected"))?.transport).toBe(transport)
    await expect(
      source.worker.previewSessionCommand("selected", pause, "cancel-write"),
    ).rejects.toThrow("cannot pause unless playing")
  },
)

test.each([RpcTransport.Stopped, RpcTransport.Paused])(
  "cancellation wins when the original Play write loses the prior %s revision",
  async (transport) => {
    const entered = deferred<void>()
    const commit = deferred<void>()
    const source = await fixture({ transport })
    source.setWrite(async (...args) => {
      if (args[1]._tag === "transport.play") {
        entered.resolve()
        await commit.promise
      }
      return source.worker.queueSessionCommand(...args)
    })
    const pending = source.host.execute("selected", play, "cancelled-play")
    await entered.promise
    await source.host.execute("selected", pause, "cancel-write")
    const current = await source.database.session("selected")
    if (current === undefined) throw new Error("fixture session is missing")
    await source.worker.queueSessionCommand(
      current,
      { _tag: "volume.set", payload: { volume: 70 } },
      "concurrent-volume",
    )
    commit.resolve()
    expect(await pending).toMatchObject({ _tag: "Cancelled", session: { transport, volume: 70 } })
    expect(source.plays()).toBe(1)
    expect(
      (await source.worker.previewSessionCommand("selected", play, "cancelled-play")).replayed,
    ).toBe(false)
    expect(
      (await source.database.outbox()).map((entry) =>
        entry.kind === "session.command" ? entry.command._tag : entry.kind,
      ),
    ).toEqual(["volume.set"])
  },
)

test.each([RpcTransport.Stopped, RpcTransport.Paused])(
  "cancelled Play correction retries a changed revision without restarting prior %s audio",
  async (transport) => {
    const entered = deferred<void>()
    const commit = deferred<void>()
    const source = await fixture({ transport })
    let conflicted = false
    source.setWrite(async (...args) => {
      if (args[1]._tag === "transport.play") {
        entered.resolve()
        await commit.promise
      } else if (!conflicted) {
        conflicted = true
        const current = await source.database.session("selected")
        if (current === undefined) throw new Error("fixture session is missing")
        await source.worker.queueSessionCommand(
          current,
          { _tag: "volume.set", payload: { volume: 70 } },
          "concurrent-volume",
        )
      }
      return source.worker.queueSessionCommand(...args)
    })
    const pending = source.host.execute("selected", play)
    await entered.promise
    await source.host.execute("selected", pause, "cancel-write")
    commit.resolve()
    expect(await pending).toMatchObject({ _tag: "Cancelled", session: { transport, volume: 70 } })
    expect(source.plays()).toBe(1)
    expect((await source.database.session("selected"))?.transport).toBe(transport)
  },
)

test.each([RpcTransport.Stopped, RpcTransport.Paused])(
  "a failed cancelled-Play correction from %s does not restart audio on refresh or receipt replay",
  async (transport) => {
    const entered = deferred<void>()
    const commit = deferred<void>()
    const source = await fixture({ transport })
    source.setWrite(async (...args) => {
      if (args[1]._tag === "transport.play") {
        entered.resolve()
        await commit.promise
        return source.worker.queueSessionCommand(...args)
      }
      throw new Error("correction quota exceeded")
    })
    const pending = source.host.execute("selected", play, "committed-play")
    const rejection = expect(pending).rejects.toThrow("correction quota exceeded")
    await entered.promise
    await source.host.execute("selected", pause, "cancel-write")
    commit.resolve()
    await rejection
    const current = await source.database.session("selected")
    expect(current?.transport).toBe(RpcTransport.Playing)
    expect(source.plays()).toBe(1)
    source.host.renderSession(current)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(source.plays()).toBe(1)
    source.setWrite((...args) => source.worker.queueSessionCommand(...args))
    await source.host.execute("selected", play, "committed-play")
    expect(source.plays()).toBe(1)
    await source.host.execute("selected", play, "explicit-retry")
    expect(source.plays()).toBe(2)
  },
)

test("later media-failure Pause retries a changed revision without replaying failed audio", async () => {
  const source = await fixture()
  await source.host.execute("selected", play)
  let conflicted = false
  source.setWrite(async (...args) => {
    if (args[1]._tag === "transport.pause" && !conflicted) {
      conflicted = true
      const current = await source.database.session("selected")
      if (current === undefined) throw new Error("fixture session is missing")
      await source.worker.queueSessionCommand(
        current,
        { _tag: "volume.set", payload: { volume: 70 } },
        "concurrent-volume",
      )
    }
    return source.worker.queueSessionCommand(...args)
  })
  source.media()?.dispatchEvent(new Event("error"))
  await vi.waitFor(async () =>
    expect((await source.database.session("selected"))?.transport).toBe(RpcTransport.Paused),
  )
  expect(source.plays()).toBe(1)
  expect(source.failures).toHaveLength(1)
})

test("a normal queued Pause keeps its receipt when media fails during the preceding Play write", async () => {
  const entered = deferred<void>()
  const commit = deferred<void>()
  const source = await fixture({ transport: RpcTransport.Playing })
  source.setWrite(async (...args) => {
    if (args[1]._tag === "transport.play") {
      entered.resolve()
      await commit.promise
    }
    return source.worker.queueSessionCommand(...args)
  })
  const pendingPlay = source.host.execute("selected", play)
  await entered.promise
  const pendingPause = source.host.execute("selected", pause, "normal-pause")
  const pauseResult = pendingPause.then(
    (outcome) => ({ outcome, failure: undefined }),
    (failure: unknown) => ({ outcome: undefined, failure }),
  )
  await vi.waitFor(() => expect(source.pauses()).toBeGreaterThan(0))
  source.media()?.dispatchEvent(new Event("error"))
  commit.resolve()
  await pendingPlay
  expect(await pauseResult).toMatchObject({
    outcome: { _tag: "Applied", session: { transport: RpcTransport.Paused } },
    failure: undefined,
  })
  expect(
    (await source.worker.previewSessionCommand("selected", pause, "normal-pause")).replayed,
  ).toBe(true)
  expect(source.plays()).toBe(1)
})

test("an error before Play confirmation completes refuses the transition immediately", async () => {
  const pendingPlay = deferred<void>()
  const source = await fixture({ play: () => pendingPlay.promise })
  const pending = source.host.execute("selected", play)
  const rejection = expect(pending).rejects.toThrow("audio failed while Play was being confirmed")
  await vi.waitFor(() => expect(source.plays()).toBe(1))
  source.media()?.dispatchEvent(new Event("error"))
  await rejection
  expect(await source.database.outbox()).toEqual([])
  expect((await source.database.session("selected"))?.transport).toBe(RpcTransport.Stopped)
  pendingPlay.resolve()
})

test("detaching the element pauses audio before disposal loses its element reference", async () => {
  const source = await fixture()
  await source.host.execute("selected", play)
  const pauses = source.pauses()
  source.host.attachAudio(null)
  expect(source.pauses()).toBe(pauses + 1)
})

test("late errors from detached elements cannot correct a replacement session", async () => {
  const source = await fixture()
  await source.host.execute("selected", play)
  const old = source.media()
  const onError = old?.onerror
  source.host.attachAudio(document.createElement("audio"))
  if (old !== undefined && onError !== null && onError !== undefined)
    onError.call(old, new Event("error"))
  expect(source.failures).toEqual([])
  expect((await source.database.session("selected"))?.transport).toBe(RpcTransport.Playing)
})

test("a changed revision restores the latest durable session and revalidates before retrying Play", async () => {
  let source: Awaited<ReturnType<typeof fixture>> | undefined
  let changed = false
  source = await fixture({
    play: async () => {
      if (changed || source === undefined) return
      changed = true
      const current = await source.database.session("selected")
      if (current === undefined) throw new Error("fixture session missing")
      await source.worker.queueSessionCommand(
        current,
        { _tag: "volume.set", payload: { volume: 70 } },
        "cross-tab",
      )
    },
  })
  expect(await source.host.execute("selected", play, "play-1")).toMatchObject({
    _tag: "Applied",
    session: { volume: 70, transport: RpcTransport.Playing },
  })
  expect(source.plays()).toBe(2)
  expect(source.media()?.volume).toBe(0.7)
  expect(
    (await source.database.outbox()).filter(
      (entry) => entry.kind === "session.command" && entry.command._tag === "transport.play",
    ),
  ).toHaveLength(1)
})

test.each(["commit", "rollback"] as const)(
  "renderer reset owns old Playing state until storage %s",
  async (mode) => {
    const gate = deferred<void>()
    const source = await fixture({ transport: RpcTransport.Playing })
    await source.host.execute("selected", play)
    source.setWrite(async (...args) => {
      await gate.promise
      if (mode === "rollback") throw new Error("configured reset write failure")
      return source.worker.queueSessionCommand(...args)
    })
    const pending = source.host.execute("selected", { _tag: "queue.clear", payload: {} }).then(
      (outcome) => ({ outcome, failure: undefined }),
      (failure: unknown) => ({ outcome: undefined, failure }),
    )
    await vi.waitFor(() => expect(source.urls.at(-1)).toBeUndefined())
    source.host.renderSession(await source.database.session("selected"))
    expect(source.loads).toEqual(["track"])
    expect(source.plays()).toBe(1)
    gate.resolve()
    const result = await pending
    if (mode === "commit") {
      expect(result.outcome).toMatchObject({ _tag: "Applied", session: { queue: [] } })
      expect(source.plays()).toBe(1)
    } else {
      expect(result.failure).toMatchObject({ message: "configured reset write failure" })
      expect(source.plays()).toBe(2)
      expect((await source.database.session("selected"))?.queue).toEqual(["track"])
    }
  },
)

test("durable ownership loss during confirmation fences revision retry and stops this renderer", async () => {
  let source: Awaited<ReturnType<typeof fixture>> | undefined
  source = await fixture({
    play: async () => {
      if (source === undefined) throw new Error("fixture is missing")
      const current = await source.database.session("selected")
      if (current === undefined) throw new Error("fixture session is missing")
      await source.database.putSession({
        ...current,
        hostDeviceId: "other-host",
        repeat: RpcRepeatMode.Off,
        shuffle: false,
        revision: current.revision + 1,
      })
    },
  })
  await expect(source.host.execute("selected", play)).rejects.toMatchObject({ name: "AbortError" })
  expect(source.plays()).toBe(1)
  expect(source.urls.at(-1)).toBeUndefined()
  expect(await source.database.outbox()).toEqual([])
  expect((await source.database.session("selected"))?.hostDeviceId).toBe("other-host")
})

test("durable ownership is checked before stream and renderer effects", async () => {
  const source = await fixture()
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("fixture session is missing")
  await source.database.putSession({ ...current, hostDeviceId: "other-host", revision: 2 })
  await expect(source.host.execute("selected", play)).rejects.toMatchObject({ name: "AbortError" })
  expect(source.loads).toEqual([])
  expect(source.plays()).toBe(0)
  expect(await source.database.outbox()).toEqual([])
})

test("automatic rendering checks the incoming snapshot owner when selected ownership is stale", async () => {
  const source = await fixture()
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("fixture session is missing")
  const reassigned = { ...current, hostDeviceId: "other-host", transport: RpcTransport.Playing }
  await source.database.putSession(reassigned)
  source.host.renderSession(reassigned)
  expect(source.loads).toEqual([])
  expect(source.plays()).toBe(0)
})

test("a fresh redundant Play preserves the advancing element position", async () => {
  const source = await fixture({ transport: RpcTransport.Playing, positionMs: 90_000 })
  await source.host.execute("selected", play)
  const media = source.media()
  if (media === undefined) throw new Error("fixture media is missing")
  media.currentTime = 95
  await source.host.execute("selected", play)
  expect(media.currentTime).toBe(95)
  expect(source.loads).toEqual(["track"])
})

test("cancellation before element attachment retains the new source's initial seek for retry", async () => {
  const source = await fixture({
    transport: RpcTransport.Paused,
    positionMs: 90_000,
    attachImmediately: false,
  })
  const pending = source.host.execute("selected", play)
  await vi.waitFor(() => expect(source.media()).toBeDefined())
  await source.host.execute("selected", pause)
  expect(await pending).toMatchObject({ _tag: "Cancelled" })
  const media = source.media()
  if (media === undefined) throw new Error("fixture media is missing")
  source.host.attachAudio(media)
  await source.host.execute("selected", play)
  expect(media.currentTime).toBe(90)
  expect(source.loads).toEqual(["track"])
})

test("disposing a host fences pending stream publication", async () => {
  const stream = deferred<string>()
  const source = await fixture({ stream: () => stream.promise })
  const pending = source.host.execute("selected", play)
  await vi.waitFor(() => expect(source.loads).toEqual(["track"]))
  source.host.dispose()
  stream.resolve("/retired-source")
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  expect(source.urls).toEqual([])
  expect(source.plays()).toBe(0)
  expect(source.failures).toEqual([])
})

test("seek waits for renderer confirmation before recording its durable receipt", async () => {
  const source = await fixture()
  await source.host.execute("selected", play, "start")
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("session missing")
  const known = { ...current, durationMs: 10000 }
  await source.database.putSession(known)
  source.select(known)
  const audio = source.media()
  if (audio === undefined) throw new Error("audio missing")
  Object.defineProperty(audio, "duration", { value: 10, configurable: true })
  let seeking = true
  Object.defineProperty(audio, "seeking", { get: () => seeking, configurable: true })
  const pending = source.host.execute(
    "selected",
    { _tag: "transport.seek", payload: { positionMs: 5000 } },
    "seek-1",
  )
  await vi.waitFor(() => expect(audio.currentTime).toBe(5))
  expect((await source.database.session("selected"))?.positionMs).toBe(0)
  seeking = false
  audio.dispatchEvent(new Event("seeked"))
  expect(await pending).toMatchObject({ _tag: "Applied", session: { positionMs: 5000 } })
  const writes = (await source.database.outbox()).length
  await source.host.execute(
    "selected",
    { _tag: "transport.seek", payload: { positionMs: 5000 } },
    "seek-1",
  )
  expect((await source.database.outbox()).length).toBe(writes)
})

test("a refused seek and a failed receipt write restore prior renderer and session truth", async () => {
  const source = await fixture()
  await source.host.execute("selected", play)
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("session missing")
  const known = { ...current, durationMs: 10000 }
  await source.database.putSession(known)
  source.select(known)
  const audio = source.media()
  if (audio === undefined) throw new Error("audio missing")
  Object.defineProperty(audio, "duration", { value: 10, configurable: true })
  let position = 0
  Object.defineProperty(audio, "currentTime", {
    get: () => position,
    set: (next: number) => {
      if (next !== 5) position = next
    },
    configurable: true,
  })
  await expect(
    source.host.execute(
      "selected",
      { _tag: "transport.seek", payload: { positionMs: 5000 } },
      "refused",
    ),
  ).rejects.toThrow("refused seek")
  expect((await source.database.session("selected"))?.positionMs).toBe(0)
  source.setWrite(async () => {
    throw new Error("receipt unavailable")
  })
  await expect(
    source.host.execute(
      "selected",
      { _tag: "transport.seek", payload: { positionMs: 3000 } },
      "storage-failure",
    ),
  ).rejects.toThrow("receipt unavailable")
  expect(audio.currentTime).toBe(0)
  expect((await source.database.session("selected"))?.positionMs).toBe(0)
})

test("a late seek directive cannot scrub a newer session revision", async () => {
  const source = await fixture()
  const current = await source.database.session("selected")
  if (current === undefined) throw new Error("session missing")
  const known = { ...current, durationMs: 10000, revision: 5 }
  await source.database.putSession(known)
  source.select(known)
  await expect(
    source.host.applyDirective({
      sessionId: "selected",
      command: { _tag: "transport.seek", payload: { positionMs: 3000 } },
      directiveId: "stale",
      issuedBy: "console",
      expectedRevision: 4,
    }),
  ).rejects.toThrow("stale session directive")
  expect(source.loads).toEqual([])
  expect(await source.database.outbox()).toEqual([])
  expect((await source.database.session("selected"))?.positionMs).toBe(0)
})

test("repeat-one confirms a real replay before publishing the next session revision", async () => {
  const source = await fixture()
  await source.host.execute("selected", play, "start")
  await source.host.execute(
    "selected",
    { _tag: "repeat.set", payload: { mode: RpcRepeatMode.One } },
    "mode",
  )
  const audio = source.media()
  if (audio === undefined) throw new Error("audio missing")
  audio.currentTime = 10
  const priorPlays = source.plays()
  await source.host.execute("selected", { _tag: "transport.trackEnded", payload: {} }, "ended")
  expect(source.plays()).toBe(priorPlays + 1)
  expect(audio.currentTime).toBe(0)
  expect(await source.database.session("selected")).toMatchObject({
    cursor: 0,
    positionMs: 0,
    repeat: RpcRepeatMode.One,
    transport: RpcTransport.Playing,
  })
})

test("mode toggles do not seek or restart the current renderer", async () => {
  const source = await fixture({ positionMs: 7000 })
  await source.host.execute("selected", play, "start")
  const plays = source.plays()
  await source.host.execute(
    "selected",
    { _tag: "repeat.set", payload: { mode: RpcRepeatMode.All } },
    "repeat",
  )
  await source.host.execute(
    "selected",
    { _tag: "shuffle.set", payload: { enabled: true } },
    "shuffle",
  )
  expect(source.plays()).toBe(plays)
  expect(source.media()?.currentTime).toBe(7)
  expect(await source.database.session("selected")).toMatchObject({
    repeat: RpcRepeatMode.All,
    shuffle: true,
    positionMs: 7000,
  })
})

test("a refused repeat renderer transition has no receipt and can retry the same intent", async () => {
  let refused = false
  const source = await fixture({
    play: async () => {
      if (refused) throw new Error("native repeat refused")
    },
  })
  await source.host.execute("selected", play, "start")
  await source.host.execute(
    "selected",
    { _tag: "repeat.set", payload: { mode: RpcRepeatMode.One } },
    "mode",
  )
  const prior = await source.database.session("selected")
  refused = true
  const ended = { _tag: "transport.trackEnded", payload: {} } as const
  await expect(source.host.execute("selected", ended, "repeat-end")).rejects.toThrow(
    "native repeat refused",
  )
  expect(await source.database.session("selected")).toEqual(prior)
  expect(
    (await source.database.outbox()).some(
      (entry) => entry.kind === "session.command" && entry.commandId === "repeat-end",
    ),
  ).toBe(false)
  refused = false
  expect(await source.host.execute("selected", ended, "repeat-end")).toMatchObject({
    _tag: "Applied",
    replayed: false,
  })
})
