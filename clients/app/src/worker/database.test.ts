import { describe, expect, test } from "vitest"
import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { SCHEMA_ROW_ID, type WorkerAlbum, type WorkerEngine } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"

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
