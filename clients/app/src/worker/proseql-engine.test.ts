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
import { RpcPlacement, RpcTransport } from "../../../../contracts/generated/pyxis"
import type { WorkerAlbum } from "./contract"
import { openWorkerDatabase } from "./database"
import { createProseqlEngine } from "./proseql-engine"

let wasm: WebAssembly.Module

beforeAll(() => {
  wasm = new WebAssembly.Module(readFileSync(fileURLToPath(workerWasmUrl)))
})

/// One in-memory `Storage`, shared across engine instances, so a second open sees what the
/// first one wrote. That is what "survives a reload" means.
function storageBackedBy(cells: Map<string, string>, writes?: string[]): Storage {
  return {
    get length() {
      return cells.size
    },
    key: (index: number) => [...cells.keys()][index] ?? null,
    getItem: (key: string) => cells.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes?.push(key)
      cells.set(key, String(value))
    },
    removeItem: (key: string) => {
      cells.delete(key)
    },
    clear: () => cells.clear(),
  } as unknown as Storage
}

interface PersistenceBehavior {
  readonly beforeWrite?: (path: string) => Promise<void>
  readonly afterWrite?: (path: string) => void
}

async function open(
  cells: Map<string, string>,
  writes?: string[],
  behavior: PersistenceBehavior = {},
) {
  const host = createWebStorageEngineStorageHost({
    storage: storageBackedBy(cells, writes),
    keyPrefix: "pyxis-test:",
  })
  const handle = await createProseqlEngine({
    wasm,
    storageHost: {
      ...host,
      async write(path: string, data: string) {
        await behavior.beforeWrite?.(path)
        await host.write(path, data)
        behavior.afterWrite?.(path)
      },
    },
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

function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const sharedTrack = { id: "track-1", title: "Track", artist: "Artist", revision: 1 }

function sharedMedium(albumIds: readonly string[]) {
  return {
    id: sharedTrack.id,
    trackId: sharedTrack.id,
    albumIds,
    candidateId: "candidate-1",
    candidateUrl: "https://pyxis.test/candidate-1",
    bytes: 100,
    contentType: "audio/flac",
    cachedAt: 1,
  }
}

describe("the real ProseQL engine", () => {
  test("a fresh library snapshot writes albums once and survives reopen", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    const identity = await first.settings()
    await first.close()
    const writes: string[] = []
    const database = await open(cells, writes)
    const albums = Array.from({ length: 370 }, (_, index) => album(`album-${index}`))

    expect(await database.applyRemoteAlbums(albums)).toBe(370)
    expect(writes.filter((key) => key.endsWith("albums.json"))).toHaveLength(1)
    await database.close()
    const reopened = await open(cells, writes)
    expect(new Map((await reopened.albums()).map((row) => [row.id, row]))).toEqual(
      new Map(albums.map((row) => [row.id, row])),
    )
    expect(await reopened.settings()).toEqual(identity)
    writes.length = 0
    expect(await reopened.applyRemoteAlbums(albums)).toBe(0)
    expect(writes).toEqual([])
    const refreshed = albums.map((row) => ({ ...row, revision: 2, title: "Refreshed" }))
    expect(await reopened.applyRemoteAlbums(refreshed)).toBe(370)
    expect(writes.filter((key) => key.endsWith("albums.json"))).toHaveLength(1)
    await reopened.close()
    const final = await open(cells)
    expect(new Map((await final.albums()).map((row) => [row.id, row]))).toEqual(
      new Map(refreshed.map((row) => [row.id, row])),
    )
    await final.close()
  }, 30_000)

  test("a snapshot does not acknowledge before its durable write completes", async () => {
    const cells = new Map<string, string>()
    const writing = signal()
    const release = signal()
    const database = await open(cells, [], {
      beforeWrite: async (path) => {
        if (!path.endsWith("albums.json")) return
        writing.resolve()
        await release.promise
      },
    })
    let acknowledged = false
    const pending = database.applyRemoteAlbums([album("album-1"), album("album-2")]).then(() => {
      acknowledged = true
    })
    try {
      await writing.promise
      expect(acknowledged).toBe(false)
      expect([...cells.keys()].some((key) => key.endsWith("albums.json"))).toBe(false)
    } finally {
      release.resolve()
    }
    await pending
    await database.close()
    const reopened = await open(cells)
    expect(await reopened.albums()).toHaveLength(2)
    await reopened.close()
  })

  test("a snapshot waits for offline relationship persistence too", async () => {
    const cells = new Map<string, string>()
    const initial = await open(cells)
    const retained = { ...album("album-1"), tracks: [sharedTrack] }
    await initial.putAlbum(retained)
    await initial.putOfflineMedium(sharedMedium([retained.id]))
    await initial.close()
    const writing = signal()
    const release = signal()
    const database = await open(cells, [], {
      beforeWrite: async (path) => {
        if (!path.endsWith("offline-media.json")) return
        writing.resolve()
        await release.promise
      },
    })
    let acknowledged = false
    const pending = database
      .applyRemoteAlbums([{ ...retained, revision: 2, tracks: [] }])
      .then(() => {
        acknowledged = true
      })
    try {
      await writing.promise
      expect(acknowledged).toBe(false)
    } finally {
      release.resolve()
    }
    await pending
    await database.close()
    const reopened = await open(cells)
    expect(await reopened.offlineMedium(sharedTrack.id)).toEqual(sharedMedium([]))
    await reopened.close()
  })

  test("a snapshot preserves queued intent, newer revisions and duplicate order", async () => {
    const cells = new Map<string, string>()
    const initial = await open(cells)
    const queued = { ...album("queued"), tracks: [sharedTrack] }
    const absentQueued = album("absent-queued")
    const newer = { ...album("newer", 5), tracks: [sharedTrack] }
    const unchanged = album("unchanged", 2)
    const updated = { ...album("updated"), artworkUrl: "https://pyxis.test/old.jpg" }
    for (const row of [queued, absentQueued, newer, unchanged, updated]) await initial.putAlbum(row)
    await initial.queuePlacement(queued, RpcPlacement.Collection)
    await initial.queuePlacement(absentQueued, RpcPlacement.Archive)
    await initial.putOfflineMedium(sharedMedium([queued.id, newer.id]))
    await initial.close()
    const writes: string[] = []
    const database = await open(cells, writes)
    const pending = await database.outbox()
    expect(pending).toHaveLength(2)
    const snapshot = [
      { ...queued, revision: 10, placement: RpcPlacement.Dismissed, tracks: [] },
      album(newer.id, 2, "Stale"),
      album(unchanged.id, 2, "Same revision cannot replace it"),
      album(updated.id, 2, "Updated"),
      album("duplicate", 3, "First"),
      album("duplicate", 2, "Older"),
      album("duplicate", 3, "Last"),
    ]
    expect(await database.applyRemoteAlbums(snapshot)).toBe(4)
    expect(writes.filter((key) => key.endsWith("albums.json"))).toHaveLength(1)
    await database.close()
    const final = await open(cells)
    expect(await final.album(queued.id)).toEqual({ ...queued, placement: RpcPlacement.Collection })
    expect(await final.album(absentQueued.id)).toEqual({
      ...absentQueued,
      placement: RpcPlacement.Archive,
    })
    expect(await final.album(newer.id)).toEqual(newer)
    expect(await final.album(unchanged.id)).toEqual(unchanged)
    expect(await final.album(updated.id)).toEqual(album(updated.id, 2, "Updated"))
    expect(await final.album("duplicate")).toEqual(album("duplicate", 3, "Last"))
    expect(await final.offlineMedium(sharedTrack.id)).toEqual(sharedMedium([queued.id, newer.id]))
    expect(await final.outbox()).toEqual(pending)
    await final.close()
  })

  test("a rejected album snapshot leaves pins and media unchanged", async () => {
    const cells = new Map<string, string>()
    const initial = await open(cells)
    const removed = { ...album("removed"), tracks: [sharedTrack] }
    const pin = { id: removed.id, albumId: removed.id, pinnedAt: 1, generation: 4 }
    const media = sharedMedium([removed.id])
    await initial.putAlbum(removed)
    await initial.putOfflinePin(pin)
    await initial.putOfflineMedium(media)
    await initial.queueListen({
      id: "01M00000000000000000000000",
      trackId: sharedTrack.id,
      deviceId: "device-1",
      completed: true,
      context: "library",
      listenedAt: "2026-09-07T00:00:00Z",
    })
    await initial.close()
    const interrupted = await open(cells, [], {
      beforeWrite: async (path) => {
        if (path.endsWith("albums.json")) throw new Error("album write rejected")
      },
    })
    const pending = await interrupted.outbox()
    expect(pending).toHaveLength(1)
    await expect(interrupted.applyRemoteAlbums([])).rejects.toThrow("album write rejected")
    await expect(interrupted.putAlbum(album("later"))).rejects.toThrow("quarantined")
    await interrupted.close().catch(() => undefined)
    const final = await open(cells)
    expect(await final.album(removed.id)).toEqual(removed)
    expect(await final.offlinePin(removed.id)).toEqual(pin)
    expect(await final.offlineMedium(sharedTrack.id)).toEqual(media)
    expect(await final.outbox()).toEqual(pending)
    await final.close()
  })

  test.each([
    { name: "media", failedFiles: ["offline-media.json"] },
    { name: "pins", failedFiles: ["offline-pins.json"] },
    { name: "media and pins", failedFiles: ["offline-media.json", "offline-pins.json"] },
  ])("snapshot retry repairs $name after albums already committed", async ({ failedFiles }) => {
    const cells = new Map<string, string>()
    const initial = await open(cells)
    const changed = { ...album("changed"), tracks: [sharedTrack] }
    const removed = { ...album("removed"), tracks: [sharedTrack] }
    const shared = { ...album("shared"), tracks: [sharedTrack] }
    await initial.putAlbum(changed)
    await initial.putAlbum(removed)
    await initial.putAlbum(shared)
    await initial.putOfflinePin({
      id: removed.id,
      albumId: removed.id,
      pinnedAt: 1,
      generation: 4,
      lastError: "old failure",
    })
    await initial.putOfflineMedium(sharedMedium([changed.id, removed.id, shared.id]))
    await initial.close()

    const albumsCommitted = signal()
    const interrupted = await open(cells, [], {
      beforeWrite: async (path) => {
        if (!failedFiles.some((file) => path.endsWith(file))) return
        await albumsCommitted.promise
        throw new Error("interrupted relationship write")
      },
      afterWrite: (path) => {
        if (path.endsWith("albums.json")) albumsCommitted.resolve()
      },
    })
    const snapshot = [{ ...changed, revision: 2, tracks: [] }, shared]
    await expect(interrupted.applyRemoteAlbums(snapshot)).rejects.toThrow(
      "interrupted relationship write",
    )
    await interrupted.close().catch(() => undefined)
    const retry = await open(cells)
    expect(await retry.album(changed.id)).toEqual(snapshot[0])
    expect(await retry.album(removed.id)).toBeUndefined()
    expect(await retry.applyRemoteAlbums(snapshot)).toBe(0)
    await retry.close()
    const final = await open(cells)
    expect(await final.offlineMedium(sharedTrack.id)).toEqual(sharedMedium([shared.id]))
    expect(await final.offlinePin(removed.id)).toEqual({
      id: removed.id,
      albumId: removed.id,
      pinnedAt: 1,
      generation: 5,
      pinned: false,
    })
    await final.applyRemoteAlbums(snapshot)
    expect((await final.offlinePin(removed.id))?.generation).toBe(5)
    await final.close()
  })

  test("opens cleanly rather than falling back to a store that keeps nothing", async () => {
    const database = await open(new Map())

    expect(database.report.reason).toBe("created")
    // The symptom on a real device: an ephemeral fallback reporting `reset`.
    expect(database.report.ephemeral).toBeUndefined()
  })

  test("read-only reopens never rewrite persisted collections", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    await first.writeSettings({ bearerToken: "token", deviceId: "device-1" })
    await first.putAlbum(album("album-1"))
    const session = {
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
    }
    await first.putSession(session)
    const queued = await first.queueSessionCommand(
      session,
      { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
      "one",
    )
    await first.putOfflinePin({ id: "album-1", albumId: "album-1", pinnedAt: 1, generation: 1 })
    await first.putOfflineMedium({
      id: "track-1",
      trackId: "track-1",
      albumIds: ["album-1"],
      candidateId: "candidate-1",
      candidateUrl: "https://pyxis.test/candidate-1",
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 1,
    })
    await first.close()
    const before = new Map(cells)
    const writes: string[] = []
    for (let round = 0; round < 3; round += 1) {
      const reopened = await open(cells, writes)
      expect(reopened.report).toMatchObject({ reason: "opened", version: 8 })
      expect(await reopened.session("session-1")).toEqual(queued)
      expect(await reopened.albums()).toEqual([album("album-1")])
      expect((await reopened.settings()).deviceId).toBe("device-1")
      expect(await reopened.outbox()).toHaveLength(1)
      expect(await reopened.offlinePins()).toHaveLength(1)
      expect(await reopened.offlineMedia()).toHaveLength(1)
      expect(
        (
          await reopened.previewSessionCommand(
            session.id,
            { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
            "one",
          )
        ).replayed,
      ).toBe(true)
      await reopened.close()
    }
    expect(writes).toEqual([])
    expect(cells).toEqual(before)
  })

  test("placement verdicts preserve later intent and metadata through a real engine reopen", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    const initial = await first.putAlbum(album("album-1"))
    await first.queuePlacement(initial, RpcPlacement.Collection)
    await first.close()

    // Match production's refreshed handle for each public database operation. ProseQL
    // can retain a prior empty query result on the handle that enqueued the first write.
    const second = await open(cells)
    const [entry] = await second.outbox()
    const collection = await second.album(initial.id)
    if (entry === undefined || collection === undefined) throw new Error("missing placement")
    await second.queuePlacement(collection, RpcPlacement.Archive)
    await second.close()

    const reopened = await open(cells)
    const verdict = {
      ...initial,
      title: "Server metadata",
      revision: 2,
      placement: RpcPlacement.Collection,
    }
    await reopened.applyPlacementVerdict(verdict, entry.id)
    await reopened.dequeue(entry.id)
    await reopened.close()

    const final = await open(cells)
    expect(final.report.ephemeral).toBeUndefined()
    expect(await final.album(initial.id)).toEqual({ ...verdict, placement: RpcPlacement.Archive })
    expect(await final.outbox()).toMatchObject([
      { kind: "album.placement", placement: RpcPlacement.Archive },
    ])
    await final.close()
  })

  test("a session mutation does not rewrite unrelated collections on reopen", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    await first.putAlbum(album("album-1"))
    const session = {
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
    }
    await first.putSession(session)
    await first.close()
    const before = new Map(cells)
    const writes: string[] = []
    const reopened = await open(cells, writes)
    const changed = { ...session, volume: 50, revision: 2 }
    expect(await reopened.applyRemoteSession(changed)).toEqual({
      status: "applied",
      session: changed,
    })
    await reopened.close()
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatch(/sessions\.json$/)
    for (const [key, value] of before)
      if (!key.endsWith("sessions.json")) expect(cells.get(key)).toBe(value)
    const final = await open(cells)
    expect(await final.session(session.id)).toEqual(changed)
    expect(await final.album("album-1")).toEqual(album("album-1"))
    await final.close()
  })

  test("readable storage stays durable when a later mutation is rejected", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    await first.putAlbum(album("album-1"))
    await first.close()
    const before = new Map(cells)
    const storage = storageBackedBy(cells)
    storage.setItem = () => {
      throw new Error("quota exhausted")
    }
    const handle = await createProseqlEngine({
      wasm,
      storageHost: createWebStorageEngineStorageHost({ storage, keyPrefix: "pyxis-test:" }),
    })
    const reopened = await openWorkerDatabase({ engine: handle.engine, clear: handle.clear })
    expect(reopened.report).toMatchObject({ reason: "opened" })
    expect(reopened.report.ephemeral).toBeUndefined()
    expect(await reopened.album("album-1")).toEqual(album("album-1"))
    await expect(reopened.putAlbum(album("album-1", 2, "changed"))).rejects.toThrow(
      "quota exhausted",
    )
    await reopened.close().catch(() => undefined)
    expect(cells).toEqual(before)
    const final = await open(cells)
    expect(await final.album("album-1")).toEqual(album("album-1"))
    await final.close()
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
    await first.putOfflinePin({ id: "album-1", albumId: "album-1", pinnedAt: 1, generation: 1 })
    await first.putOfflineMedium({
      id: "track-1",
      trackId: "track-1",
      albumIds: ["album-1"],
      candidateId: "candidate-1",
      candidateUrl: "https://pyxis.test/__pyxis/offline/default/candidate-1",
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 1,
    })
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
    expect(await reopened.offlinePins()).toHaveLength(1)
    expect(await reopened.offlineMedia()).toMatchObject([
      { trackId: "track-1", albumIds: ["album-1"], candidateId: "candidate-1" },
    ])
    expect(await reopened.outbox()).toHaveLength(1)
  })

  test("an account switch removes old optional settings instead of patching them through", async () => {
    const database = await open(new Map())
    await database.writeSettings({
      accountId: "account-1",
      bearerToken: "token-1",
      resumeToken: "resume-1",
      syncNotices: [
        {
          id: "notice-1",
          kind: "dropped",
          writeId: "write-1",
          reason: "rejected",
        },
      ],
    })

    await database.writeSettings({
      accountId: "account-2",
      accountName: "Second",
      accountIsDefault: false,
      accountCreatedAt: "now",
      bearerToken: "token-2",
      deviceId: "device-2",
      deviceName: "Browser",
    })

    expect(await database.settings()).toMatchObject({
      accountId: "account-2",
      bearerToken: "token-2",
    })
    expect((await database.settings()).resumeToken).toBeUndefined()
    expect((await database.settings()).syncNotices).toBeUndefined()
  })

  test("updates a row in place rather than duplicating it", async () => {
    const database = await open(new Map())
    await database.putAlbum(album("album-1", 1))

    await database.putAlbum(album("album-1", 2, "Renamed"))

    const stored = await database.albums()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.title).toBe("Renamed")
  })

  test("a cleared session removes its former cursor and current track across reopen", async () => {
    const cells = new Map<string, string>()
    const database = await open(cells)
    const session = {
      id: "session-1",
      name: "Browser",
      hostDeviceId: "device-1",
      transport: RpcTransport.Stopped,
      positionMs: 0,
      volume: 100,
      reachable: true,
      revision: 1,
      updatedAt: "now",
      queue: ["track-1"],
      cursor: 0,
      currentTrackId: "track-1",
    }
    await database.putSession(session)
    const { cursor: _cursor, currentTrackId: _currentTrackId, ...cleared } = session
    await database.putSession({ ...cleared, queue: [], revision: 2 })
    expect((await database.session(session.id))?.currentTrackId).toBeUndefined()
    expect((await database.session(session.id))?.cursor).toBeUndefined()
    await database.close()
    const reopened = await open(cells)
    expect((await reopened.session(session.id))?.currentTrackId).toBeUndefined()
    expect((await reopened.session(session.id))?.cursor).toBeUndefined()
    expect((await reopened.session(session.id))?.queue).toEqual([])
  })

  test("a same-revision pull repairs obsolete optional session fields", async () => {
    const cells = new Map<string, string>()
    const database = await open(cells)
    const snapshot = {
      id: "session-1",
      name: "Browser",
      hostDeviceId: "device-1",
      transport: RpcTransport.Stopped,
      positionMs: 0,
      volume: 100,
      reachable: true,
      revision: 2,
      updatedAt: "now",
      queue: [],
    }
    // Simulate an earlier deep-merged snapshot, then reopen as the production lock does.
    await database.putSession({ ...snapshot, cursor: 0, currentTrackId: "track-1" })
    await database.close()
    const reopened = await open(cells)
    expect(await reopened.sessions()).toEqual([
      { ...snapshot, cursor: 0, currentTrackId: "track-1" },
    ])
    expect(await reopened.applyRemoteSessions([snapshot])).toBe(1)
    expect(await reopened.session(snapshot.id)).toEqual(snapshot)
    expect(await reopened.applyRemoteSessions([snapshot])).toBe(0)
  })

  test("a complete offline pin snapshot removes an omitted error", async () => {
    const cells = new Map<string, string>()
    const database = await open(cells)
    const pin = { id: "album-1", albumId: "album-1", pinnedAt: 1, generation: 1 }
    await database.putOfflinePin({ ...pin, lastError: "interrupted download" })
    await database.putOfflinePin({ ...pin, generation: 2 })
    await database.close()
    const reopened = await open(cells)
    expect(await reopened.offlinePin(pin.id)).toEqual({ ...pin, generation: 2 })
  })

  test("a single session event preserves durable queued intent across worker reopens", async () => {
    const cells = new Map<string, string>()
    const first = await open(cells)
    const snapshot = {
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
    }
    await first.putSession(snapshot)
    const optimistic = await first.queueSessionCommand(
      snapshot,
      { _tag: "queue.add", payload: { trackIds: ["local-track"] } },
      "local-command",
    )
    await first.close()
    const reopened = await open(cells)
    const remote = { ...snapshot, revision: 3 }
    expect(await reopened.applyRemoteSession(remote)).toEqual({ status: "queued" })
    expect(await reopened.session(snapshot.id)).toEqual(optimistic)
    const pending = await reopened.outbox()
    expect(pending).toHaveLength(1)
    for (const entry of pending) await reopened.dequeue(entry.id)
    await reopened.close()
    const reconciled = await open(cells)
    expect(await reconciled.applyRemoteSession(remote)).toEqual({
      status: "applied",
      session: remote,
    })
    await reconciled.close()
    const final = await open(cells)
    expect(await final.session(snapshot.id)).toEqual(remote)
  })

  test("removes what it says it removed", async () => {
    const database = await open(new Map())
    await database.putAlbum(album("album-1"))

    expect(await database.removeAlbum("album-1")).toBe(true)
    expect(await database.albums()).toHaveLength(0)
    expect(await database.album("album-1")).toBeUndefined()
  })
})
