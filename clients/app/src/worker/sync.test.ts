import { describe, expect, test, vi } from "vitest"
import {
  type ListenTrackEventInput,
  type RpcLibraryAlbum,
  RpcPlacement,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { createWorkerRpc, RpcError, type WorkerRpc } from "../rpc/client"
import { resolvePlacement } from "./conflict"
import type { WorkerAlbum, WorkerDatabase, WorkerOutboxEntry } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { LISTEN_BATCH_SIZE } from "./listen-sync"
import { sync } from "./sync"

function album(
  id: string,
  placement: RpcPlacement,
  revision: number,
  updatedAt = "2026-01-01",
): WorkerAlbum {
  return {
    id,
    title: "Heroes",
    artist: "David Bowie",
    placement,
    placementUpdatedAt: updatedAt,
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

function placementWrite(
  id: string,
  albumId: string,
  placement: RpcPlacement,
  base: { revision: number; placement: RpcPlacement },
  createdAt = "2026-06-01",
): WorkerOutboxEntry {
  return {
    id,
    createdAt,
    attempts: 0,
    kind: "album.placement",
    albumId,
    placement,
    baseRevision: base.revision,
    basePlacement: base.placement,
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

interface FakeServer {
  rpc: WorkerRpc
  albums: Map<string, RpcLibraryAlbum>
  listens: Map<string, ListenTrackEventInput>
  offline: boolean
  reject?: (events: readonly ListenTrackEventInput[]) => string | undefined
  /// Fails a placement write without touching the pull, which is how a real server
  /// rejects one record while staying reachable.
  failPlacement?: () => RpcError | undefined
  placementCalls: number
  listenCalls: number
}

function server(initial: RpcLibraryAlbum[] = []): FakeServer {
  const state: FakeServer = {
    albums: new Map(initial.map((entry) => [entry.id, entry])),
    listens: new Map(),
    offline: false,
    placementCalls: 0,
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
    async setPlacement(albumId, placement) {
      if (state.offline) throw new RpcError("offline", true)
      state.placementCalls += 1
      const failure = state.failPlacement?.()
      if (failure !== undefined) throw failure
      const existing = state.albums.get(albumId)
      if (existing === undefined) return undefined
      const updated = {
        ...existing,
        placement,
        revision: existing.revision + 1,
        placementUpdatedAt: "2026-07-01",
      }
      state.albums.set(albumId, updated)
      return updated
    },
    async appendListen(events) {
      if (state.offline) throw new RpcError("offline", true)
      state.listenCalls += 1
      const reason = state.reject?.(events)
      if (reason !== undefined) throw new RpcError(reason, false)
      let accepted = 0
      let duplicates = 0
      for (const event of events) {
        if (state.listens.has(event.id)) duplicates += 1
        else {
          state.listens.set(event.id, event)
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
      setPlacement: async () => undefined,
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
      setPlacement: async () => undefined,
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
      setPlacement: async () => undefined,
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
      setPlacement: async () => undefined,
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

  test("a broken session pull does not strand placements or listens", async () => {
    let placement = RpcPlacement.Discovery
    const rpc: WorkerRpc = {
      listAlbums: async () => [
        album("album-1", placement, placement === RpcPlacement.Discovery ? 1 : 2),
      ],
      listSessions: async () => {
        throw new RpcError("session was malformed", false)
      },
      runSessionCommand: async () => undefined,
      setPlacement: async (_albumId, next) => {
        placement = next
        return album("album-1", placement, 2)
      },
      appendListen: async (events) => ({ accepted: events.length, duplicates: 0 }),
    }
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
        listenWrite("01B", "track-1"),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, rpc)

    expect(report.failure).toContain("session was malformed")
    expect(report.pushed).toBe(2)
    expect(await store.outbox()).toEqual([])
  })

  test("a retryable placement failure does not strand sessions or listens", async () => {
    let remoteSession = hostedSession()
    const command: RpcSessionCommand = {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    }
    const rpc: WorkerRpc = {
      listAlbums: async () => [album("album-1", RpcPlacement.Discovery, 1)],
      listSessions: async () => [remoteSession],
      runSessionCommand: async () => {
        remoteSession = hostedSession({
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          revision: 2,
        })
        return remoteSession
      },
      setPlacement: async () => {
        throw new RpcError("album endpoint is busy", true)
      },
      appendListen: async (events) => ({ accepted: events.length, duplicates: 0 }),
    }
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
        sessionWrite("01B", command),
        listenWrite("01C", "track-2"),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
      [hostedSession({ queue: ["track-1"], cursor: 0, currentTrackId: "track-1", revision: 2 })],
    )

    const report = await sync(store, rpc)

    expect(report.offline).toBe(true)
    expect(report.pushed).toBe(2)
    expect(await store.outbox()).toMatchObject([{ id: "01A", kind: "album.placement" }])
  })

  test("a placement changed offline reaches the server on reconnect", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(report.pushed).toBe(1)
    expect(remote.albums.get("album-1")?.placement).toBe(RpcPlacement.Collection)
    expect(await store.outbox()).toHaveLength(0)
  })

  test("listens batch on reconnect and land in server history", async () => {
    const remote = server()
    const store = await database([listenWrite("01A", "track-1"), listenWrite("01B", "track-2")])

    const report = await sync(store, remote.rpc)

    expect(report.pushed).toBe(2)
    expect([...remote.listens.keys()].sort()).toEqual(["01A", "01B"])
    expect(await store.outbox()).toHaveLength(0)
  })

  test("nothing is lost while the server is unreachable", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    remote.offline = true
    const store = await database([
      placementWrite("01A", "album-1", RpcPlacement.Collection, {
        revision: 1,
        placement: RpcPlacement.Discovery,
      }),
      listenWrite("01B", "track-1"),
    ])

    const report = await sync(store, remote.rpc)

    expect(report.offline).toBe(true)
    expect(await store.outbox()).toHaveLength(2)
  })
})

describe("replay", () => {
  test("draining the same queue twice produces one change", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    await sync(store, remote.rpc)
    // Re-queue the identical write, as a client that lost its acknowledgement would.
    await store.enqueue(
      placementWrite("01A", "album-1", RpcPlacement.Collection, {
        revision: 1,
        placement: RpcPlacement.Discovery,
      }),
    )
    await sync(store, remote.rpc)

    expect(remote.placementCalls).toBe(1)
    expect(remote.albums.get("album-1")?.revision).toBe(2)
  })

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

  test("a deferred second change stays visible after the first reaches the server", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    let writes = 0
    remote.failPlacement = () => {
      writes += 1
      return writes === 1 ? undefined : new RpcError("offline", true)
    }
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
        placementWrite("01B", "album-1", RpcPlacement.Archive, {
          revision: 1,
          placement: RpcPlacement.Collection,
        }),
      ],
      [album("album-1", RpcPlacement.Archive, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(report.deferred).toBe(1)
    expect(await store.outbox()).toMatchObject([{ id: "01B", placement: RpcPlacement.Archive }])
    expect(await store.album("album-1")).toMatchObject({
      placement: RpcPlacement.Archive,
      revision: 2,
    })
  })

  test("a second change to the same album is sent, not mistaken for a replay", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    const store = await database(
      [
        placementWrite(
          "01A",
          "album-1",
          RpcPlacement.Collection,
          {
            revision: 1,
            placement: RpcPlacement.Discovery,
          },
          "2026-06-01",
        ),
        placementWrite(
          "01B",
          "album-1",
          RpcPlacement.Archive,
          {
            revision: 1,
            placement: RpcPlacement.Collection,
          },
          "2026-06-02",
        ),
      ],
      [album("album-1", RpcPlacement.Archive, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(remote.placementCalls).toBe(2)
    expect(remote.albums.get("album-1")?.placement).toBe(RpcPlacement.Archive)
    expect(report.conflicts).toEqual([])
  })
})

describe("a write the server refuses", () => {
  test("never drops a retryable write because it has failed five times", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    remote.failPlacement = () => new RpcError("upstream is busy", true)
    const entry = placementWrite("01A", "album-1", RpcPlacement.Collection, {
      revision: 1,
      placement: RpcPlacement.Discovery,
    })
    const store = await database(
      [{ ...entry, attempts: 4 }],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(report.dropped).toEqual([])
    expect(await store.outbox()).toMatchObject([{ id: "01A", attempts: 5 }])
  })

  test("stays queued while the failure is worth repeating", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    remote.failPlacement = () => new RpcError("upstream is busy", true)
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(report.deferred).toBe(1)
    const queued = await store.outbox()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.attempts).toBe(1)
  })

  test("is dropped with the server's reason once it is refused outright", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    remote.failPlacement = () => new RpcError("album title and artist are required", false)
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(report.dropped).toEqual([{ id: "01A", reason: "album title and artist are required" }])
    expect(await store.outbox()).toHaveLength(0)
    // The device must not keep showing a change the server never accepted.
    expect((await store.album("album-1"))?.placement).toBe(RpcPlacement.Discovery)
  })

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
        throw new RpcError("album was missing its identity, placement, or revision", false)
      },
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      setPlacement: async () => undefined,
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }

    const report = await sync(store, broken)

    expect(report.failure).toContain("placement")
    expect(report.offline).toBe(false)
    expect(report.pushed).toBe(1)
    expect(await store.outbox()).toEqual([])
  })

  test("survives an expired token instead of being thrown away", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    remote.failPlacement = () =>
      new RpcError("bearer token is invalid or revoked", false, "auth.invalidToken", true)
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    await sync(store, remote.rpc)

    const queued = await store.outbox()
    expect(queued).toHaveLength(1)
    // Repeating it changes nothing until the credentials do, so it is not counted as a
    // failed attempt either.
    expect(queued[0]?.attempts).toBe(0)
  })
})

describe("pulling", () => {
  test("removes a cached album that no longer exists on the server", async () => {
    const remote = server([])
    const store = await database([], [album("album-1", RpcPlacement.Discovery, 1)])

    const report = await sync(store, remote.rpc)

    expect(report.pulled).toBe(1)
    expect(await store.album("album-1")).toBeUndefined()
  })

  test("removal between pull and placement push is still reported", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 1)])
    const rpc: WorkerRpc = {
      ...remote.rpc,
      setPlacement: async () => undefined,
    }
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, rpc)

    expect(await store.album("album-1")).toBeUndefined()
    expect(await store.outbox()).toEqual([])
    expect(report.conflicts).toEqual([
      {
        albumId: "album-1",
        kept: "removed",
        discarded: RpcPlacement.Collection,
      },
    ])
  })

  test("server removal wins and reports a queued placement as discarded", async () => {
    const remote = server([])
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
      ],
      [album("album-1", RpcPlacement.Collection, 1)],
    )

    const report = await sync(store, remote.rpc)

    expect(await store.album("album-1")).toBeUndefined()
    expect(await store.outbox()).toEqual([])
    expect(report.conflicts).toEqual([
      {
        albumId: "album-1",
        kept: "removed",
        discarded: RpcPlacement.Collection,
      },
    ])
    expect((await store.settings()).syncNotices).toMatchObject([
      {
        kind: "conflict",
        albumId: "album-1",
        kept: "removed",
        discarded: RpcPlacement.Collection,
      },
    ])

    await sync(store, remote.rpc)
    expect((await store.settings()).syncNotices).toHaveLength(1)
  })

  test("a stale server snapshot never undoes a newer local record", async () => {
    const remote = server([album("album-1", RpcPlacement.Discovery, 3)])
    const store = await database([], [album("album-1", RpcPlacement.Collection, 5)])

    await sync(store, remote.rpc)

    expect((await store.album("album-1"))?.placement).toBe(RpcPlacement.Collection)
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

describe("conflicts", () => {
  test("a two-device edit resolves by the later action and is reported", async () => {
    // The other device moved it to archive on the server after this write was queued.
    const remote = server([album("album-1", RpcPlacement.Archive, 4, "2026-09-01")])
    const store = await database(
      [
        placementWrite(
          "01A",
          "album-1",
          RpcPlacement.Collection,
          {
            revision: 1,
            placement: RpcPlacement.Discovery,
          },
          "2026-06-01",
        ),
      ],
      [album("album-1", RpcPlacement.Archive, 4, "2026-09-01")],
    )

    const report = await sync(store, remote.rpc)

    expect(report.conflicts).toEqual([
      { albumId: "album-1", kept: RpcPlacement.Archive, discarded: RpcPlacement.Collection },
    ])
    // The remote change was newer, so nothing was sent.
    expect(remote.placementCalls).toBe(0)
    expect(await store.outbox()).toHaveLength(0)
  })

  test("the local change wins when it is the later one, and still reports", async () => {
    const remote = server([album("album-1", RpcPlacement.Archive, 4, "2026-02-01")])
    const store = await database(
      [
        placementWrite(
          "01A",
          "album-1",
          RpcPlacement.Collection,
          {
            revision: 1,
            placement: RpcPlacement.Discovery,
          },
          "2026-06-01",
        ),
      ],
      [album("album-1", RpcPlacement.Archive, 4, "2026-02-01")],
    )

    const report = await sync(store, remote.rpc)

    expect(report.conflicts).toEqual([
      { albumId: "album-1", kept: RpcPlacement.Collection, discarded: RpcPlacement.Archive },
    ])
    expect(remote.albums.get("album-1")?.placement).toBe(RpcPlacement.Collection)
  })

  test("two devices resolve an identical timestamp the same way", () => {
    const at = "2026-06-01T00:00:00Z"
    const write = (deviceId: string) => ({
      albumId: "album-1",
      placement: RpcPlacement.Collection,
      baseRevision: 1,
      basePlacement: RpcPlacement.Discovery,
      queuedAt: at,
      deviceId,
    })
    const remote = {
      placement: RpcPlacement.Archive,
      revision: 4,
      placementUpdatedAt: at,
      deviceId: "device-b",
    }

    expect(resolvePlacement(write("device-a"), remote).action).toBe("keepRemote")
    expect(resolvePlacement(write("device-c"), remote).action).toBe("push")
  })
})

describe("a batch the server will not take", () => {
  test("isolates the rejected event and still sends the rest", async () => {
    const remote = server()
    remote.reject = (events) =>
      events.some((event) => event.trackId === "poison") ? "invalid event" : undefined
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

  test("an album missing its placement or revision never reaches storage", async () => {
    const rpc = createWorkerRpc({
      token: "t",
      fetch: respond({
        _tag: "library.albums.list",
        outcome: { status: "ready", value: [{ id: "album-1", title: "Heroes" }] },
      }),
    })

    await expect(rpc.listAlbums()).rejects.toThrow(/placement, or revision/)
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

describe("a full offline session", () => {
  test("queue edits and listens reconcile together", async () => {
    const remote = server([
      album("album-1", RpcPlacement.Discovery, 1),
      album("album-2", RpcPlacement.Discovery, 1),
    ])
    remote.offline = true
    const store = await database(
      [
        placementWrite("01A", "album-1", RpcPlacement.Collection, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
        listenWrite("01B", "track-1"),
        placementWrite("01C", "album-2", RpcPlacement.Archive, {
          revision: 1,
          placement: RpcPlacement.Discovery,
        }),
        listenWrite("01D", "track-2"),
      ],
      [album("album-1", RpcPlacement.Collection, 1), album("album-2", RpcPlacement.Archive, 1)],
    )

    const offlineReport = await sync(store, remote.rpc)
    expect(offlineReport.offline).toBe(true)
    expect(await store.outbox()).toHaveLength(4)

    remote.offline = false
    const online = await sync(store, remote.rpc)

    expect(online.offline).toBe(false)
    expect(await store.outbox()).toHaveLength(0)
    expect(remote.albums.get("album-1")?.placement).toBe(RpcPlacement.Collection)
    expect(remote.albums.get("album-2")?.placement).toBe(RpcPlacement.Archive)
    expect(remote.listens.size).toBe(2)
  })
})
