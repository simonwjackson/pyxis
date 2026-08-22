/// The adapter, against the real engine.
///
/// This is the test that was missing. Every other worker test runs on the in-memory fake,
/// which happily agreed with three wrong assumptions: that a missing row resolves rather
/// than rejects, that a delete of nothing is harmless, and that upsert takes a row. The
/// real engine disagrees on all three, so the entire local database silently fell back to
/// an ephemeral store on a real device.
///
/// IndexedDB is not available outside a browser, but the engine is. Swapping in a storage
/// host over an in-memory `Storage` exercises the same code path this client runs.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { workerWasmUrl } from "@proseql/browser/worker"
import { createWebStorageEngineStorageHost } from "@proseql/engine/browser"
import { beforeAll, describe, expect, test } from "vitest"
import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import type { WorkerAlbum } from "./contract"
import { openWorkerDatabase } from "./database"
import { createProseqlEngine } from "./proseql-engine"

let wasm: WebAssembly.Module

beforeAll(() => {
  wasm = new WebAssembly.Module(readFileSync(fileURLToPath(workerWasmUrl)))
})

/// One in-memory `Storage`, shared across engine instances, so a second open sees what the
/// first one wrote. That is what "survives a reload" means.
function storageBackedBy(cells: Map<string, string>): Storage {
  return {
    get length() {
      return cells.size
    },
    key: (index: number) => [...cells.keys()][index] ?? null,
    getItem: (key: string) => cells.get(key) ?? null,
    setItem: (key: string, value: string) => {
      cells.set(key, String(value))
    },
    removeItem: (key: string) => {
      cells.delete(key)
    },
    clear: () => cells.clear(),
  } as unknown as Storage
}

async function open(cells: Map<string, string>) {
  const handle = await createProseqlEngine({
    wasm,
    storageHost: createWebStorageEngineStorageHost({
      storage: storageBackedBy(cells),
      keyPrefix: "pyxis-test:",
    }),
  })
  return openWorkerDatabase({ engine: handle.engine, clear: handle.clear })
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

describe("the real ProseQL engine", () => {
  test("opens cleanly rather than falling back to a store that keeps nothing", async () => {
    const database = await open(new Map())

    expect(database.report.reason).toBe("created")
    // The symptom on a real device: an ephemeral fallback reporting `reset`.
    expect(database.report.ephemeral).toBeUndefined()
  })

  test("a missing row is an answer, not a failure", async () => {
    const database = await open(new Map())

    expect(await database.album("never-stored")).toBeUndefined()
    expect(await database.removeAlbum("never-stored")).toBe(false)
  })

  test("keeps albums, settings, and queued writes across a reopen", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    const { deviceId } = await first.settings()
    await first.writeSettings({ bearerToken: "token" })
    await first.putAlbum(album("album-1", 1, "Low"))
    await first.enqueue({
      id: "01A",
      createdAt: "2026-06-01",
      attempts: 0,
      kind: "album.placement",
      albumId: "album-1",
      placement: RpcPlacement.Collection,
      baseRevision: 1,
      basePlacement: RpcPlacement.Discovery,
    })
    await first.close()

    const reopened = await open(cells)

    expect(reopened.report.reason).toBe("opened")
    expect(reopened.report.ephemeral).toBeUndefined()
    expect((await reopened.settings()).deviceId).toBe(deviceId)
    expect((await reopened.settings()).bearerToken).toBe("token")
    expect((await reopened.albums()).map((entry) => entry.title)).toEqual(["Low"])
    expect(await reopened.outbox()).toHaveLength(1)
  })

  test("updates a row in place rather than duplicating it", async () => {
    const database = await open(new Map())
    await database.putAlbum(album("album-1", 1))

    await database.putAlbum(album("album-1", 2, "Renamed"))

    const stored = await database.albums()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.title).toBe("Renamed")
  })

  test("removes what it says it removed", async () => {
    const database = await open(new Map())
    await database.putAlbum(album("album-1"))

    expect(await database.removeAlbum("album-1")).toBe(true)
    expect(await database.albums()).toHaveLength(0)
    expect(await database.album("album-1")).toBeUndefined()
  })
})
