import { describe, expect, test } from "vitest"
import {
  type ListenTrackEventInput,
  RpcPlacement,
  type RpcSession,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { SCHEMA_ROW_ID, type WorkerAlbum, type WorkerEngine } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"

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
    updatedAt: "now",
    ...overrides,
  }
}

function album(id: string, revision = 1, title = "Heroes"): WorkerAlbum {
  return {
    id,
    title,
    artist: "David Bowie",
    placement: RpcPlacement.Discovery,
    placementUpdatedAt: "now",
    addedAt: "now",
    revision,
    tracks: [],
  }
}

describe("opening the local database", () => {
  test("reports a first run and mints one stable device id", async () => {
    const engine = createMemoryEngine()
    const database = await openWorkerDatabase({ engine })
    expect(database.report.reason).toBe("created")

    const first = await database.settings()
    const second = await database.settings()
    expect(first.deviceId).toBe(second.deviceId)
    expect(first.deviceId?.length).toBeGreaterThan(8)
  })

  test("survives a reload with the same engine", async () => {
    const engine = createMemoryEngine()
    const first = await openWorkerDatabase({ engine })
    const { deviceId } = await first.settings()
    await first.putAlbum(album("album-1"))
    await first.writeSettings({ bearerToken: "token" })
    await first.close()

    // A reload is a fresh database object over storage that already has data.
    const reopened = await openWorkerDatabase({ engine })
    expect(reopened.report.reason).toBe("opened")
    expect((await reopened.settings()).deviceId).toBe(deviceId)
    expect((await reopened.settings()).bearerToken).toBe("token")
    expect(await reopened.albums()).toHaveLength(1)
  })
})

describe("schema versions", () => {
  test("a version bump migrates existing data instead of discarding it", async () => {
    const engine = createMemoryEngine()
    const before = await openWorkerDatabase({ engine, version: 1 })
    await before.putAlbum(album("album-1", 1, "Low"))
    await before.close()

    let ran = 0
    const upgraded = await openWorkerDatabase({
      engine,
      version: 2,
      migrations: {
        2: async (target: WorkerEngine) => {
          ran += 1
          for (const stored of await target.albums.all()) {
            await target.albums.upsert({ ...stored, title: `${stored.title} (migrated)` })
          }
        },
      },
    })

    expect(ran).toBe(1)
    expect(upgraded.report).toMatchObject({ reason: "migrated", fromVersion: 1, version: 2 })
    const albums = await upgraded.albums()
    expect(albums).toHaveLength(1)
    expect(albums[0]?.title).toBe("Low (migrated)")
  })

  test("the deployed schema v2 store migrates to the current version without data loss", async () => {
    const engine = createMemoryEngine()
    const before = await openWorkerDatabase({
      engine,
      version: 2,
      migrations: { 2: async () => {} },
    })
    await before.putAlbum(album("album-1"))
    await before.writeSettings({ bearerToken: "token" })

    const upgraded = await openWorkerDatabase({ engine })

    expect(upgraded.report).toMatchObject({ reason: "migrated", fromVersion: 2, version: 7 })
    expect(await upgraded.albums()).toHaveLength(1)
    expect((await upgraded.settings()).bearerToken).toBe("token")
  })

  test("a missing migration resets rather than half-upgrading", async () => {
    const engine = createMemoryEngine()
    const before = await openWorkerDatabase({ engine, version: 1 })
    await before.putAlbum(album("album-1"))

    const opened = await openWorkerDatabase({ engine, version: 3, migrations: {} })

    expect(opened.report.reason).toBe("reset")
    expect(await opened.albums()).toHaveLength(0)
  })

  test("a database from a newer build is discarded rather than guessed at", async () => {
    const engine = createMemoryEngine()
    await engine.meta.upsert({ id: SCHEMA_ROW_ID, version: 99 })
    await engine.albums.upsert(album("album-from-the-future"))

    const opened = await openWorkerDatabase({ engine, version: 1 })

    expect(opened.report).toMatchObject({ reason: "reset", fromVersion: 99 })
    expect(await opened.albums()).toHaveLength(0)
  })

  test("data with no version row is not trusted", async () => {
    const engine = createMemoryEngine()
    await engine.albums.upsert(album("orphan"))

    const opened = await openWorkerDatabase({ engine, version: 1 })

    expect(opened.report.reason).toBe("reset")
    expect(await opened.albums()).toHaveLength(0)
  })
})

describe("a corrupt local database", () => {
  test("resets and reports the cause instead of wedging", async () => {
    const engine = createMemoryEngine()
    const broken: WorkerEngine = {
      ...engine,
      meta: {
        findById: async () => {
          throw new Error("record could not be decoded")
        },
        all: () => engine.meta.all(),
        upsert: (row) => engine.meta.upsert(row),
        delete: (id) => engine.meta.delete(id),
      },
    }
    let cleared = false
    let reported: unknown

    const opened = await openWorkerDatabase({
      engine: broken,
      clear: async () => {
        cleared = true
      },
      onReset: (cause) => {
        reported = cause
      },
    })

    expect(opened.report.reason).toBe("reset")
    expect(cleared).toBe(true)
    expect((reported as Error).message).toContain("could not be decoded")
    // The caller must still get a usable database rather than an exception.
    expect((await opened.settings()).deviceId).toBeTypeOf("string")
  })
})

describe("storage that cannot even be repaired", () => {
  test("falls back to an ephemeral store rather than refusing to open", async () => {
    const unusable: WorkerEngine = {
      meta: {
        findById: async () => {
          throw new Error("IndexedDB is unavailable")
        },
        all: async () => [],
        upsert: async () => {
          throw new Error("quota exceeded")
        },
        delete: async () => false,
      },
      settings: createMemoryEngine().settings,
      albums: createMemoryEngine().albums,
      sessions: createMemoryEngine().sessions,
      commandReceipts: createMemoryEngine().commandReceipts,
      outbox: createMemoryEngine().outbox,
      close: async () => undefined,
    }

    const opened = await openWorkerDatabase({
      engine: unusable,
      clear: async () => {
        throw new Error("cannot clear an unavailable database")
      },
    })

    expect(opened.report).toMatchObject({ reason: "reset", ephemeral: true })
    // Usable, and honest that nothing will be kept.
    await opened.putAlbum(album("album-1"))
    expect(await opened.albums()).toHaveLength(1)
  })
})

describe("local writes", () => {
  test("changes a hosted session locally before queueing its command", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = session()
    await database.putSession(original)

    const changed = await database.queueSessionCommand(original, {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    })

    expect(changed).toMatchObject({
      queue: ["track-1"],
      currentTrackId: "track-1",
      revision: 2,
    })
    expect(await database.outbox()).toMatchObject([
      {
        kind: "session.command",
        sessionId: "session-1",
        command: { _tag: "queue.add" },
      },
    ])
  })

  test("deduplicates a session command ID and rejects conflicting reuse", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = session()
    await database.putSession(original)
    const command = { _tag: "queue.add" as const, payload: { trackIds: ["track-1"] } }

    const first = await database.queueSessionCommand(original, command, "01COMMAND")
    const replay = await database.queueSessionCommand(original, command, "01COMMAND")

    expect(replay).toEqual(first)
    const [queued] = await database.outbox()
    expect(queued).toBeDefined()
    if (queued !== undefined) await database.dequeue(queued.id)
    const afterDrain = await database.queueSessionCommand(original, command, "01COMMAND")
    expect(afterDrain).toEqual(first)
    expect(await database.outbox()).toEqual([])
    await expect(
      database.queueSessionCommand(
        original,
        { _tag: "queue.add", payload: { trackIds: ["track-2"] } },
        "01COMMAND",
      ),
    ).rejects.toThrow("different session command")

    const other = session({ id: "session-2" })
    await database.putSession(other)
    await expect(database.queueSessionCommand(other, command, "01COMMAND")).resolves.toMatchObject({
      id: "session-2",
      queue: ["track-1"],
    })
  })

  test("previews validation and durable replays before renderer effects", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = session({ queue: ["track-1"], cursor: 0, currentTrackId: "track-1" })
    const play = { _tag: "transport.play" as const, payload: {} }
    await database.putSession(original)

    await expect(database.previewSessionCommand(original.id, play, "PLAY")).resolves.toEqual({
      session: original,
      replayed: false,
    })
    const playing = await database.queueSessionCommand(original, play, "PLAY", original.revision)
    await database.queueSessionCommand(playing, { _tag: "transport.pause", payload: {} }, "PAUSE")

    await expect(database.previewSessionCommand(original.id, play, "PLAY")).resolves.toMatchObject({
      session: { transport: RpcTransport.Paused },
      replayed: true,
    })
    await expect(
      database.previewSessionCommand(
        original.id,
        { _tag: "cursor.jump", payload: { index: 5 } },
        "STALE",
      ),
    ).rejects.toThrow("outside the queue")
  })

  test("rejects a command when the session changed after its preview", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = session()
    await database.putSession(original)
    await database.putSession({ ...original, revision: 2, updatedAt: "later" })

    await expect(
      database.queueSessionCommand(
        original,
        { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
        "COMMAND",
        1,
      ),
    ).rejects.toThrow("session changed while command was being confirmed")
    expect(await database.outbox()).toEqual([])
  })

  test("does not mistake an unrelated later revision for an interrupted command result", async () => {
    const engine = createMemoryEngine()
    const database = await openWorkerDatabase({ engine })
    const original = session({ queue: ["track-1"], cursor: 0, currentTrackId: "track-1" })
    const command = { _tag: "transport.play" as const, payload: {} }
    await database.putSession({ ...original, revision: 2, updatedAt: "remote" })
    await engine.outbox.upsert({
      id: "01QUEUE",
      createdAt: "now",
      attempts: 0,
      kind: "session.command",
      sessionId: original.id,
      commandId: "01COMMAND",
      baseRevision: 1,
      command,
    })

    await expect(
      database.previewSessionCommand(original.id, command, "01COMMAND"),
    ).resolves.toMatchObject({ replayed: false, session: { revision: 2 } })
  })

  test("repairs a command receipt after interruption", async () => {
    const engine = createMemoryEngine()
    const database = await openWorkerDatabase({ engine })
    const original = session()
    const command = { _tag: "queue.add" as const, payload: { trackIds: ["track-1"] } }
    await database.putSession(original)
    await engine.outbox.upsert({
      id: "01QUEUE",
      createdAt: "now",
      attempts: 0,
      kind: "session.command",
      sessionId: original.id,
      commandId: "01COMMAND",
      baseRevision: 1,
      command,
    })

    const repaired = await database.queueSessionCommand(original, command, "01COMMAND")

    expect(repaired).toMatchObject({ queue: ["track-1"], revision: 2 })
    expect(await engine.commandReceipts.findById("session-1:01COMMAND")).toMatchObject({
      fingerprint: expect.any(String),
    })
    expect(await database.outbox()).toHaveLength(1)
  })

  test("changes an album locally before queueing its server write", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = album("album-1")
    await database.putAlbum(original)

    const changed = await database.queuePlacement(original, RpcPlacement.Collection)

    expect(changed.placement).toBe(RpcPlacement.Collection)
    expect(await database.outbox()).toMatchObject([
      {
        kind: "album.placement",
        albumId: "album-1",
        placement: RpcPlacement.Collection,
        baseRevision: 1,
        basePlacement: RpcPlacement.Discovery,
        attempts: 0,
      },
    ])
  })

  test("a stale click snapshot still becomes the newest local intent", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const clickedFrom = { ...album("album-1", 1), placement: RpcPlacement.Collection }
    await database.putAlbum({ ...clickedFrom, revision: 2 })

    const changed = await database.queuePlacement(clickedFrom, RpcPlacement.Archive)

    expect(changed).toMatchObject({ placement: RpcPlacement.Archive, revision: 2 })
    expect(await database.album("album-1")).toMatchObject({
      placement: RpcPlacement.Archive,
      revision: 2,
    })
    expect(await database.outbox()).toMatchObject([
      { baseRevision: 1, basePlacement: RpcPlacement.Collection },
    ])
  })

  test("keeps the outbox record if the local album write fails", async () => {
    const engine = createMemoryEngine()
    const database = await openWorkerDatabase({
      engine: {
        ...engine,
        albums: {
          findById: (id) => engine.albums.findById(id),
          all: () => engine.albums.all(),
          upsert: async () => {
            throw new Error("quota exceeded")
          },
          delete: (id) => engine.albums.delete(id),
        },
      },
    })

    await expect(
      database.queuePlacement(album("album-1"), RpcPlacement.Collection),
    ).rejects.toThrow("quota exceeded")
    expect(await database.outbox()).toMatchObject([
      { albumId: "album-1", placement: RpcPlacement.Collection },
    ])
  })

  test("accepts an identical listen replay but rejects conflicting ID reuse", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const event: ListenTrackEventInput = {
      id: "01LISTEN",
      trackId: "track-1",
      deviceId: "device-1",
      listenedAt: "2026-06-01T00:00:00Z",
      completed: true,
      context: "queue",
    }
    await database.queueListen(event)

    await database.queueListen(event)
    await expect(database.queueListen({ ...event, trackId: "track-2" })).rejects.toThrow(
      "different content",
    )

    expect(await database.outbox()).toMatchObject([
      { event: { id: "01LISTEN", trackId: "track-1" } },
    ])
  })

  test("keeps the public listen ID separate from local queue ordering", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const event: ListenTrackEventInput = {
      id: "01LISTEN",
      trackId: "track-1",
      deviceId: "device-1",
      listenedAt: "2026-06-01T00:00:00Z",
      completed: true,
      context: "queue",
    }

    await database.queueListen(event)

    const [queued] = await database.outbox()
    expect(queued).toMatchObject({ kind: "listen.append", event })
    expect(queued?.id).not.toBe(event.id)
  })
})

describe("account changes", () => {
  test("clears the previous account library before storing a new grant", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({ accountId: "account-1" })
    await database.putAlbum(album("album-1"))
    await database.putSession(session())

    await database.writeSettings({
      accountId: "account-2",
      accountName: "Second",
      accountIsDefault: false,
      accountCreatedAt: "now",
      deviceId: "device-2",
      deviceName: "Browser",
      bearerToken: "token-2",
    })

    expect(await database.albums()).toEqual([])
    expect(await database.sessions()).toEqual([])
    expect(await database.settings()).toMatchObject({
      accountId: "account-2",
      deviceId: "device-2",
    })
  })

  test("refuses a partial account change that would retain old credentials", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({ accountId: "account-1", bearerToken: "token-1" })

    await expect(database.writeSettings({ accountId: "account-2" })).rejects.toThrow(
      "complete account grant",
    )
    expect(await database.settings()).toMatchObject({
      accountId: "account-1",
      bearerToken: "token-1",
    })
  })

  test("refuses to replay one account's outbox with another account's token", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({ accountId: "account-1" })
    const original = album("album-1")
    await database.putAlbum(original)
    await database.queuePlacement(original, RpcPlacement.Collection)

    await expect(database.writeSettings({ accountId: "account-2" })).rejects.toThrow(
      "queued writes",
    )
    expect((await database.settings()).accountId).toBe("account-1")
    expect(await database.outbox()).toHaveLength(1)
  })
})

describe("albums", () => {
  test("an older revision never replaces a newer one", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album("album-1", 5, "current"))

    const rejected = await database.putAlbum(album("album-1", 4, "stale"))

    expect(rejected.title).toBe("current")
    expect((await database.album("album-1"))?.title).toBe("current")
  })

  test("replacing the library removes what the server no longer has", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album("album-1"))
    await database.putAlbum(album("album-2"))

    await database.replaceAlbums([album("album-2", 2), album("album-3")])

    const ids = (await database.albums()).map((entry) => entry.id).sort()
    expect(ids).toEqual(["album-2", "album-3"])
  })

  test("removing reports whether anything was there", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album("album-1"))

    expect(await database.removeAlbum("album-1")).toBe(true)
    expect(await database.removeAlbum("album-1")).toBe(false)
  })
})
