import { Option } from "effect"
import { describe, expect, expectTypeOf, test, vi } from "vitest"
import {
  type ListenTrackEventInput,
  type RpcLibraryAlbum,
  RpcRealtimeTopic,
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import {
  createWorkerRpc,
  type ListenEventInput,
  listenEventId,
  RpcError,
  type WorkerRpc,
} from "../rpc/client"
import { accountFencedDatabase } from "./account-fenced-database"
import type {
  StoredWorkerSession,
  WorkerAlbum,
  WorkerDatabase,
  WorkerOutboxEntry,
} from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { browserOfflineExclusive } from "./downloads"
import { LISTEN_BATCH_SIZE } from "./listen-sync"
import { type WorkerSessionFeed, workerSessionFeed } from "./session-feed"
import { applySessionCommand } from "./session-local"
import { SessionRows } from "./session-rows"
import { sync } from "./sync"

function album(id: string, revision: number): WorkerAlbum {
  return {
    id,
    title: "Heroes",
    artist: "David Bowie",
    tags: [],
    addedAt: "2026-01-01",
    revision,
    tracks: [],
  }
}

function hostedSession(overrides: Partial<RpcSession> = {}): RpcSession {
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
    updatedAt: "2026-01-01",
    ...overrides,
  }
}

function sessionWrite(id: string, command: RpcSessionCommand): WorkerOutboxEntry {
  return {
    id,
    createdAt: "2026-06-01",
    attempts: 0,
    kind: "session.command",
    sessionId: "session-1",
    commandId: id,
    baseRevision: 1,
    command,
  }
}

function listenWrite(id: string, trackId: string): WorkerOutboxEntry {
  const event: ListenTrackEventInput = {
    id,
    trackId,
    deviceId: "device-1",
    listenedAt: "2026-06-01T00:00:00Z",
    completed: true,
    context: "queue",
  }
  return { id, createdAt: "2026-06-01", attempts: 0, kind: "listen.append", event }
}

interface InMemoryServer {
  rpc: WorkerRpc
  albums: Map<string, RpcLibraryAlbum>
  listens: Map<string, ListenEventInput>
  offline: boolean
  reject?: (events: readonly ListenEventInput[]) => string | undefined
  listenCalls: number
}

function server(initial: RpcLibraryAlbum[] = []): InMemoryServer {
  const state: InMemoryServer = {
    albums: new Map(initial.map((entry) => [entry.id, entry])),
    listens: new Map(),
    offline: false,
    listenCalls: 0,
    rpc: undefined as unknown as WorkerRpc,
  }

  state.rpc = {
    async listAlbums() {
      if (state.offline) throw new RpcError("offline", true)
      return [...state.albums.values()]
    },
    async listSessions() {
      return []
    },
    async runSessionCommand() {
      return undefined
    },
    async appendListen(events) {
      if (state.offline) throw new RpcError("offline", true)
      state.listenCalls += 1
      const reason = state.reject?.(events)
      if (reason !== undefined) throw new RpcError(reason, false)
      let accepted = 0
      let duplicates = 0
      for (const event of events) {
        if (state.listens.has(listenEventId(event))) duplicates += 1
        else {
          state.listens.set(listenEventId(event), event)
          accepted += 1
        }
      }
      return { accepted, duplicates }
    },
  }
  return state
}

async function database(
  entries: WorkerOutboxEntry[] = [],
  albums: WorkerAlbum[] = [],
  sessions: RpcSession[] = [],
): Promise<WorkerDatabase> {
  const store = await openWorkerDatabase({ engine: createMemoryEngine() })
  await store.writeSettings({ deviceId: "device-1" })
  for (const entry of albums) await store.putAlbum(entry)
  for (const entry of sessions) await store.putSession(entry)
  for (const entry of entries) await store.enqueue(entry)
  return store
}

describe("offline writes", () => {
  test("a hosted session command replays once with its outbox id", async () => {
    let remote = hostedSession()
    const commandIds: string[] = []
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [remote],
      runSessionCommand: async (_sessionId, command, commandId) => {
        commandIds.push(commandId)
        if (command._tag !== "queue.add") throw new Error("wrong command")
        const trackId = command.payload.trackIds[0]
        if (trackId === undefined) throw new Error("empty command")
        remote = hostedSession({
          queue: command.payload.trackIds,
          cursor: 0,
          currentTrackId: trackId,
          streamPath: `/stream/${trackId}`,
          revision: 2,
        })
        return remote
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const command: RpcSessionCommand = {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    }
    const store = await database(
      [sessionWrite("01COMMAND", command)],
      [],
      [
        hostedSession({
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          revision: 2,
        }),
      ],
    )

    const report = await sync(store, rpc)

    expect(report.pushed).toBe(1)
    expect(commandIds).toEqual(["01COMMAND"])
    expect(await store.outbox()).toEqual([])
    expect(await store.session("session-1")).toMatchObject({
      queue: ["track-1"],
      revision: 2,
    })
    await expect(
      store.previewSessionCommand("session-1", command, "01COMMAND"),
    ).resolves.toMatchObject({ replayed: true })
  })

  test("a command queued during acknowledgement stays visible and replays once", async () => {
    let remote = hostedSession()
    const engine = createMemoryEngine()
    const store = await openWorkerDatabase({ engine })
    await store.writeSettings({ deviceId: "device-1" })
    await store.putSession(remote)
    await store.queueSessionCommand(
      remote,
      { _tag: "queue.add", payload: { trackIds: ["first"] } },
      "first-command",
    )
    const exclusive = browserOfflineExclusive(undefined)
    let acknowledged = false
    let laterWrite: Promise<void> | undefined
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [remote],
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
      async runSessionCommand(_sessionId, command) {
        if (command._tag !== "queue.add") throw new Error("wrong command")
        remote = {
          ...remote,
          queue: [...remote.queue, ...command.payload.trackIds],
          revision: remote.revision + 1,
        }
        acknowledged = true
        return remote
      },
    }
    const readOutbox = engine.outbox.all.bind(engine.outbox)
    engine.outbox.all = async () => {
      const entries = await readOutbox()
      if (acknowledged && laterWrite === undefined) {
        // A local queue.add becomes ready while the acknowledgement reads pending commands.
        // It waits for the current database operation, not for the whole network sync.
        laterWrite = exclusive(async () => {
          const current = await store.session(remote.id)
          if (current === undefined) throw new Error("session disappeared")
          await store.queueSessionCommand(
            current,
            { _tag: "queue.add", payload: { trackIds: ["second"] } },
            "second-command",
          )
        })
      }
      return entries
    }
    const locked = accountFencedDatabase(store, undefined, (operation) =>
      exclusive(() => operation(store)),
    )

    const report = await sync(locked, rpc)
    expect(laterWrite).toBeDefined()
    await laterWrite

    expect.soft((await store.session(remote.id))?.queue).toEqual(["first", "second"])
    expect.soft(report).toMatchObject({ pushed: 1, deferred: 1, offline: false })
    expect(await store.outbox()).toMatchObject([
      { kind: "session.command", commandId: "second-command" },
    ])

    const replay = await sync(locked, rpc)
    expect(replay).toMatchObject({ pushed: 1, deferred: 0, dropped: [] })
    expect(remote.queue).toEqual(["first", "second"])
    expect((await store.session(remote.id))?.queue).toEqual(["first", "second"])
    expect(await store.outbox()).toEqual([])
    await store.close()
  })

  test("a local receipt repair failure defers without sending or dropping the command", async () => {
    const command: RpcSessionCommand = {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    }
    const store = await database([sessionWrite("01COMMAND", command)], [], [hostedSession()])
    const runSessionCommand = vi.fn()
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [hostedSession()],
      runSessionCommand,
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const failing = new Proxy(store, {
      get(target, property, receiver) {
        if (property === "queueSessionCommand") {
          return async () => {
            throw new Error("IndexedDB unavailable")
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === "function" ? value.bind(target) : value
      },
    }) as WorkerDatabase

    const report = await sync(failing, rpc)

    expect(report.deferred).toBe(1)
    expect(report.dropped).toEqual([])
    expect(runSessionCommand).not.toHaveBeenCalled()
    expect(await store.outbox()).toMatchObject([
      { id: "01COMMAND", attempts: 1, lastError: "IndexedDB unavailable" },
    ])
  })

  test("a permanently rejected session command restores server state", async () => {
    const command: RpcSessionCommand = {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    }
    const remote = hostedSession()
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [remote],
      runSessionCommand: async () => {
        throw new RpcError("queue command was rejected", false)
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const store = await database(
      [sessionWrite("01COMMAND", command)],
      [],
      [
        hostedSession({
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          revision: 2,
        }),
      ],
    )

    const report = await sync(store, rpc)

    expect(report.dropped).toEqual([{ id: "01COMMAND", reason: "queue command was rejected" }])
    expect(await store.outbox()).toEqual([])
    expect(await store.session("session-1")).toEqual(remote)
  })

  test("a retryable session failure keeps its command and optimistic state", async () => {
    const command: RpcSessionCommand = {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    }
    const remote = hostedSession()
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [remote],
      runSessionCommand: async () => {
        throw new RpcError("offline", true)
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const store = await database(
      [sessionWrite("01COMMAND", command)],
      [],
      [
        hostedSession({
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          revision: 2,
        }),
      ],
    )

    const report = await sync(store, rpc)

    expect(report.offline).toBe(true)
    expect(await store.outbox()).toMatchObject([{ id: "01COMMAND", attempts: 1 }])
    expect(await store.session("session-1")).toMatchObject({
      queue: ["track-1"],
      revision: 2,
    })
  })

  test("listens batch on reconnect and land in server history", async () => {
    const remote = server()
    const store = await database([listenWrite("01A", "track-1"), listenWrite("01B", "track-2")])

    const report = await sync(store, remote.rpc)

    expect(report.pushed).toBe(2)
    expect([...remote.listens.keys()].sort()).toEqual(["01A", "01B"])
    expect(await store.outbox()).toHaveLength(0)
  })
})

describe("replay", () => {
  test("a duplicate listen event is reported as a duplicate, not stored twice", async () => {
    const remote = server()
    const store = await database([listenWrite("01A", "track-1")])
    await sync(store, remote.rpc)
    await store.enqueue(listenWrite("01A", "track-1"))

    await sync(store, remote.rpc)

    expect(remote.listens.size).toBe(1)
    // The server saw it twice and said so, which is what makes replay safe rather than
    // merely harmless-looking.
    expect(remote.listenCalls).toBe(2)
  })
})

describe("a write the server refuses", () => {
  test("an expired token never deletes queued listens", async () => {
    const remote = server()
    const store = await database([listenWrite("01A", "track-1"), listenWrite("01B", "track-2")])
    const expired: WorkerRpc = {
      ...remote.rpc,
      appendListen: async () => {
        throw new RpcError("bearer token is invalid or revoked", false, "auth.invalidToken", true)
      },
    }

    const report = await sync(store, expired)

    expect(await store.outbox()).toHaveLength(2)
    expect(report.dropped).toEqual([])
    expect(report.authRequired).toBe(true)
  })

  test("a refused pull reports why instead of throwing and stranding the queue", async () => {
    const store = await database([listenWrite("01A", "track-1")])
    const broken: WorkerRpc = {
      listAlbums: async () => {
        throw new RpcError("album was missing its identity, tags, or revision", false)
      },
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }

    const report = await sync(store, broken)

    expect(report.failure).toContain("tags")
    expect(report.offline).toBe(false)
    expect(report.pushed).toBe(1)
    expect(await store.outbox()).toEqual([])
  })
})

describe("pulling", () => {
  test("applies full remote snapshots through one local batch per domain", async () => {
    const albums = Array.from({ length: 370 }, (_, index) => album(`album-${index}`, 1))
    const sessions = Array.from({ length: 20 }, (_, index) =>
      hostedSession({ id: `session-${index}`, hostDeviceId: `device-${index}` }),
    )
    const remote = server(albums)
    const rpc: WorkerRpc = { ...remote.rpc, listSessions: async () => sessions }
    const store = await database([], albums, sessions)
    const applyRemoteAlbums = vi.spyOn(store, "applyRemoteAlbums")
    const applyRemoteSessions = vi.spyOn(store, "applyRemoteSessions")
    const albumRead = vi.spyOn(store, "album")
    const sessionRead = vi.spyOn(store, "session")

    const report = await sync(store, rpc)

    expect(report.pulled).toBe(0)
    expect(applyRemoteAlbums).toHaveBeenCalledTimes(1)
    expect(applyRemoteSessions).toHaveBeenCalledTimes(1)
    expect(albumRead).not.toHaveBeenCalled()
    expect(sessionRead).not.toHaveBeenCalled()
  })

  test("accepts live reachability changes without a session revision bump", async () => {
    const local = hostedSession({ reachable: true, revision: 1 })
    const remote = { ...local, reachable: false }
    const rpc: WorkerRpc = {
      ...server([]).rpc,
      listSessions: async () => [remote],
    }
    const store = await database([], [], [local])

    const report = await sync(store, rpc)

    expect(report.pulled).toBe(1)
    expect((await store.session(local.id))?.reachable).toBe(false)
  })

  test("removes a cached album that no longer exists on the server", async () => {
    const remote = server([])
    const store = await database([], [album("album-1", 1)])

    const report = await sync(store, remote.rpc)

    expect(report.pulled).toBe(1)
    expect(await store.album("album-1")).toBeUndefined()
  })

  test("a stale server snapshot never undoes a newer local record", async () => {
    const remote = server([album("album-1", 3)])
    const store = await database([], [album("album-1", 5)])

    await sync(store, remote.rpc)

    expect((await store.album("album-1"))?.revision).toBe(5)
  })
})

describe("a long offline session of listens", () => {
  test("drains in batches and re-queues the remainder in order when the network drops", async () => {
    const remote = server()
    const entries = Array.from({ length: 120 }, (_, index) =>
      listenWrite(`01${String(index).padStart(4, "0")}`, `track-${index}`),
    )
    const store = await database(entries)

    // Fail once the first batch has landed.
    let calls = 0
    const flaky: WorkerRpc = {
      ...remote.rpc,
      appendListen: async (events) => {
        calls += 1
        if (calls > 1) throw new RpcError("offline", true)
        return remote.rpc.appendListen(events)
      },
    }

    const report = await sync(store, flaky)

    expect(remote.listens.size).toBe(LISTEN_BATCH_SIZE)
    expect(report.offline).toBe(true)
    const queued = await store.outbox()
    expect(queued).toHaveLength(120 - LISTEN_BATCH_SIZE)
    expect(queued[0]?.id).toBe(`01${String(LISTEN_BATCH_SIZE).padStart(4, "0")}`)

    // Drain the rest.
    await sync(store, remote.rpc)
    expect(remote.listens.size).toBe(120)
    expect(await store.outbox()).toHaveLength(0)
  })
})

describe("a batch the server will not take", () => {
  test("isolates the rejected event and still sends the rest", async () => {
    const remote = server()
    remote.reject = (events) =>
      events.some((event) => "trackId" in event && event.trackId === "poison")
        ? "invalid event"
        : undefined
    const store = await database([
      listenWrite("01A", "track-1"),
      { ...listenWrite("01B", "poison") },
      listenWrite("01C", "track-3"),
    ])

    const report = await sync(store, remote.rpc)

    expect([...remote.listens.keys()].sort()).toEqual(["01A", "01C"])
    expect(report.dropped.map((entry) => entry.id)).toEqual(["01B"])
    expect(await store.outbox()).toHaveLength(0)
  })
})

describe("the trust boundary", () => {
  const respond = (body: unknown, status = 200): typeof fetch =>
    (async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch

  test("an album missing its tags or revision never reaches storage", async () => {
    const rpc = createWorkerRpc({
      token: "t",
      fetch: respond({
        _tag: "library.albums.list",
        outcome: { status: "ready", value: [{ id: "album-1", title: "Heroes" }] },
      }),
    })

    await expect(rpc.listAlbums()).rejects.toThrow(/tags, or revision/)
  })

  test("a captive portal's HTML is refused rather than parsed", async () => {
    const rpc = createWorkerRpc({ token: "t", fetch: respond("<html>sign in</html>") })

    await expect(rpc.listAlbums()).rejects.toThrow("server response was not JSON")
  })

  test("a response for the wrong operation is refused", async () => {
    const rpc = createWorkerRpc({
      token: "t",
      fetch: respond({ _tag: "session.list", outcome: { status: "ready", value: [] } }),
    })

    await expect(rpc.listAlbums()).rejects.toThrow(/answered 'session.list'/)
  })

  test("a server error is retryable but a rejection is not", async () => {
    const unavailable = createWorkerRpc({ token: "t", fetch: respond("", 503) })
    const rejected = createWorkerRpc({ token: "t", fetch: respond("", 400) })

    await expect(unavailable.listAlbums()).rejects.toMatchObject({ retryable: true })
    await expect(rejected.listAlbums()).rejects.toMatchObject({ retryable: false })
  })
})

describe("session-scoped synchronization", () => {
  test.each(["offline", "auth", "malformed"])(
    "a failed %s pull preserves commands without pushing blind",
    async (failure) => {
      const database = await openWorkerDatabase({ engine: createMemoryEngine() })
      const original = await database.putSession(hostedSession())
      await database.queueSessionCommand(
        original,
        { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
        "command-1",
      )
      const before = await database.outbox()
      const listAlbums = vi.fn(async () => [])
      const runSessionCommand = vi.fn(async () => original)
      const rpc: WorkerRpc = {
        listAlbums,
        listSessions: async () => {
          throw new RpcError(failure, failure === "offline", undefined, failure === "auth")
        },
        runSessionCommand,
        appendListen: async () => ({ accepted: 0, duplicates: 0 }),
      }
      const report = await sync(database, rpc, "sessions")
      expect(listAlbums).not.toHaveBeenCalled()
      expect(runSessionCommand).not.toHaveBeenCalled()
      expect(await database.outbox()).toEqual(before)
      expect(report).toMatchObject({
        deferred: 1,
        sessionPullFailed: true,
        offline: failure === "offline",
        authRequired: failure === "auth",
      })
    },
  )
})

test("retired current-v2 shuffle outbox intent survives sync without network replay or dequeue", async () => {
  const pending: WorkerOutboxEntry = JSON.parse(
    JSON.stringify({
      ...sessionWrite("old-shuffle", { _tag: "transport.play", payload: {} }),
      command: { _tag: "queue.shuffle", payload: {} },
    }),
  )
  const initial = hostedSession({ queue: ["a", "b"], cursor: 0, currentTrackId: "a" })
  const store = await database([pending], [], [initial])
  let calls = 0
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [initial],
    runSessionCommand: async () => {
      calls += 1
      return initial
    },
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
  }
  const result = await sync(store, rpc)
  expect(result.deferred).toBe(1)
  expect(result.dropped).toEqual([])
  expect(result.failure).toContain("matching v2 client and service")
  expect(calls).toBe(0)
  expect(await store.outbox()).toEqual([pending])
})

test("offline mode replay retains the confirmed occurrence order and restores the original queue", async () => {
  let remote = hostedSession({
    queue: ["a", "b", "a", "c", "d"],
    cursor: 2,
    currentTrackId: "a",
    positionMs: 42000,
  })
  const store = await database([], [], [remote])
  const local = await store.queueSessionCommand(
    remote,
    { _tag: "shuffle.set", payload: { enabled: true } },
    "shuffle-1",
  )
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [remote],
    runSessionCommand: async (_id, command) => {
      remote = applySessionCommand(remote, command)
      return remote
    },
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
  }
  await sync(store, rpc)
  expect(remote.queue).toEqual(local.queue)
  expect(remote.queueOrder).toEqual(local.queueOrder)
  expect(await store.outbox()).toEqual([])
  await store.queueSessionCommand(
    remote,
    { _tag: "shuffle.set", payload: { enabled: false } },
    "shuffle-2",
  )
  await sync(store, rpc)
  expect(remote).toMatchObject({
    queue: ["a", "b", "a", "c", "d"],
    cursor: 2,
    positionMs: 42000,
    shuffle: false,
  })
})

describe("retirement wins over the confirming stop acknowledgement", () => {
  test.each(["event first", "ack first"])("%s, including after disconnect", async (order) => {
    const db = await database([])
    const initial = hostedSession({ transport: RpcTransport.Playing, queue: ["song"], cursor: 0 })
    await db.putSession(initial)
    await db.queueSessionCommand(initial, { _tag: "transport.stop", payload: {} }, "stop-directive")
    const feed = workerSessionFeed({
      applySessionRetirement: (id) => db.applySessionRetirement(id),
      applySessionEvent: (row) => db.applyRemoteSession(row),
    })
    expect(feed.hello("token").payload).toMatchObject({ sessionRetirements: true })
    const remove = () =>
      feed.apply({
        topic: RpcRealtimeTopic.Sessions,
        resumeToken: "1",
        state: { _tag: "session.retired", payload: { id: initial.id } },
      })
    const remote = server()
    remote.rpc.listSessions = async () => [initial]
    remote.rpc.runSessionCommand = async () => {
      if (order === "event first") await remove()
      return { ...initial, transport: RpcTransport.Stopped, revision: 2 }
    }
    expect((await sync(db, remote.rpc)).pushed).toBe(1)
    if (order === "ack first") await remove()
    remote.rpc.listSessions = async () => {
      throw new RpcError("disconnected", true)
    }
    expect((await sync(db, remote.rpc, "sessions")).offline).toBe(true)
    expect(await db.sessions()).toEqual([])
    expect(await db.session(initial.id)).toBeUndefined()
    expect(await db.outbox()).toEqual([])
  })
})

test("a creation event received during a delayed empty list stays visible", async () => {
  const db = await database([])
  const live = hostedSession()
  const remote = server().rpc
  remote.listSessions = async () => {
    // The server has taken its empty snapshot. Deliver the subsequent creation
    // on the other channel before allowing the older list to reach the worker.
    expect((await db.applyRemoteSession(live)).status).toBe("applied")
    return []
  }
  await sync(db, remote, "sessions")
  expect(await db.session(live.id)).toMatchObject(live)
  remote.listSessions = async () => [live]
  await sync(db, remote, "sessions")
  expect(await db.sessions()).toHaveLength(1)
})

test("a later list or event restores a session evicted by a completed list", async () => {
  const db = await database([]),
    live = hostedSession()
  await db.putSession(live)
  await db.applyRemoteSessions([], await db.beginSessionList())
  expect(await db.sessions()).toEqual([])
  await db.applyRemoteSessions([live], await db.beginSessionList())
  expect(await db.session(live.id)).toMatchObject(live)
  await db.applyRemoteSessions([], await db.beginSessionList())
  expect(await db.sessions()).toEqual([])
  expect((await db.applyRemoteSession(live)).status).toBe("applied")
})

test("a command against a retired id leaves existing outbox writes untouched", async () => {
  const db = await database([listenWrite("saved", "song")]),
    live = hostedSession()
  await db.putSession(live)
  await db.applySessionRetirement(live.id)
  const before = await db.outbox()
  await expect(
    db.queueSessionCommand(live, { _tag: "queue.add", payload: { trackIds: ["track"] } }, "late"),
  ).rejects.toThrow(/retired/)
  expect(await db.outbox()).toEqual(before)
})

test("the typed session feed selects Some for live state and None after retirement", async () => {
  const engine = createMemoryEngine(),
    rows = new SessionRows(engine),
    db = await openWorkerDatabase({ engine })
  const live = hostedSession(),
    feed = workerSessionFeed({
      applySessionRetirement: (id) => db.applySessionRetirement(id),
      applySessionEvent: (e) => db.applyRemoteSession(e),
    })
  expectTypeOf(feed).toEqualTypeOf<WorkerSessionFeed>()
  expectTypeOf(rows.get(live.id)).toEqualTypeOf<Promise<Option.Option<StoredWorkerSession>>>()
  expect(Option.isNone(await rows.get(live.id))).toBe(true)
  const envelope = { topic: RpcRealtimeTopic.Sessions, resumeToken: "1" }
  expect(
    await feed.apply({ ...envelope, state: { _tag: "session.state", payload: live } }),
  ).toMatchObject({ status: "applied" })
  expect(Option.getOrThrow(await rows.get(live.id))).toMatchObject(live)
  expect(
    await feed.apply({ ...envelope, state: { _tag: "session.retired", payload: { id: live.id } } }),
  ).toEqual({ status: "retired" })
  expect(Option.isNone(await rows.get(live.id))).toBe(true)
})
