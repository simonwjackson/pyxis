import { describe, expect, test, vi } from "vitest"
import {
  type RpcLibraryAlbum,
  RpcPlacement,
  type RpcSession,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import type { OfflineCache, OfflineCacheStorage } from "./downloads"
import { createOfflineDownloadManager } from "./downloads"
import {
  CANDIDATE_ID_HEADER,
  candidateUrl,
  mappingResponse,
  OFFLINE_MAP_CACHE,
  OFFLINE_MEDIA_CACHE,
  OFFLINE_STAGING_CACHE,
  readMapping,
  streamMappingUrl,
} from "./offline-cache"

class MemoryCache implements OfflineCache {
  readonly rows = new Map<string, Response>()

  constructor(private readonly onDelete?: (key: string) => void) {}

  async match(key: string): Promise<Response | undefined> {
    return this.rows.get(key)?.clone()
  }

  async put(key: string, response: Response): Promise<void> {
    this.rows.set(key, response.clone())
  }

  async delete(key: string): Promise<boolean> {
    const removed = this.rows.delete(key)
    if (removed) this.onDelete?.(key)
    return removed
  }

  async keys(): Promise<readonly string[]> {
    return [...this.rows.keys()]
  }
}

class MemoryCaches implements OfflineCacheStorage {
  readonly stores = new Map<string, MemoryCache>()

  constructor(private readonly onDelete?: (key: string) => void) {}

  async open(name: string): Promise<MemoryCache> {
    let cache = this.stores.get(name)
    if (cache === undefined) {
      cache = new MemoryCache(this.onDelete)
      this.stores.set(name, cache)
    }
    return cache
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name)
  }
}

const ORIGIN = "https://pyxis.test"
const audio = new TextEncoder().encode("complete audio bytes")

function album(id = "album-1", tracks = ["track-1"]): RpcLibraryAlbum {
  return {
    id,
    title: "Heroes",
    artist: "David Bowie",
    placement: RpcPlacement.Collection,
    placementUpdatedAt: "now",
    addedAt: "now",
    revision: 1,
    tracks: tracks.map((trackId, index) => ({
      id: trackId,
      title: trackId,
      artist: "David Bowie",
      trackNumber: index + 1,
      revision: 1,
    })),
  }
}

function session(trackId: string): RpcSession {
  return {
    id: "session-1",
    name: "Browser",
    hostDeviceId: "device-1",
    queue: [trackId],
    cursor: 0,
    currentTrackId: trackId,
    streamPath: `/stream/${trackId}`,
    transport: RpcTransport.Playing,
    positionMs: 0,
    volume: 100,
    reachable: true,
    revision: 1,
    updatedAt: "now",
  }
}

function provider(candidate: () => string, truncate = false): typeof fetch {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    if (headers.get("range") !== null) {
      return new Response(audio.slice(0, 1), {
        status: 206,
        headers: {
          "content-type": "audio/webm",
          "content-length": "1",
          "content-range": `bytes 0-0/${audio.length}`,
          [CANDIDATE_ID_HEADER]: candidate(),
        },
      })
    }
    return new Response(audio, {
      status: 200,
      headers: {
        "content-type": "audio/webm",
        "content-length": String(audio.length + (truncate ? 1 : 0)),
        [CANDIDATE_ID_HEADER]: candidate(),
      },
    })
  }) as unknown as typeof fetch
}

async function configuredDatabase() {
  const database = await openWorkerDatabase({ engine: createMemoryEngine() })
  await database.writeSettings({
    accountId: "default",
    bearerToken: "token",
    deviceId: "device-1",
  })
  await database.putAlbum(album())
  return database
}

describe("offline album downloads", () => {
  test("startup reconciliation removes cache and database fragments from interrupted commits", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const mediaCache = await caches.open(OFFLINE_MEDIA_CACHE)
    const mapCache = await caches.open(OFFLINE_MAP_CACHE)
    await mediaCache.put("https://pyxis.test/orphan-candidate", new Response(audio))
    await mapCache.put(
      "https://pyxis.test/orphan-map",
      mappingResponse({
        candidateUrl: "https://pyxis.test/orphan-candidate",
      }),
    )
    await (await caches.open(OFFLINE_STAGING_CACHE)).put(
      "https://pyxis.test/old-staging",
      new Response(audio, { headers: { "x-pyxis-staged-at": "0" } }),
    )
    await database.putOfflineMedium({
      id: "missing-cache",
      trackId: "missing-cache",
      albumIds: [],
      candidateId: "missing",
      candidateUrl: "https://pyxis.test/missing-cache",
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 1,
    })
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-1"),
      caches,
      origin: ORIGIN,
    })

    await manager.overview()

    expect(mediaCache.rows.size).toBe(0)
    expect(mapCache.rows.size).toBe(0)
    expect((await caches.open(OFFLINE_STAGING_CACHE)).rows.size).toBe(0)
    expect(await database.offlineMedium("missing-cache")).toBeUndefined()
  })

  test("startup reconciliation repairs a DB-first publication whose mapping was not committed", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const candidate = candidateUrl(ORIGIN, "default", "device-1", "candidate-new")
    await (await caches.open(OFFLINE_MEDIA_CACHE)).put(candidate, new Response(audio))
    await (await caches.open(OFFLINE_MAP_CACHE)).put(
      streamMappingUrl(ORIGIN, "default", "device-1", "track-1"),
      mappingResponse({ candidateUrl: "https://pyxis.test/old-candidate" }),
    )
    await database.putOfflineMedium({
      id: "track-1",
      trackId: "track-1",
      albumIds: ["album-1"],
      candidateId: "candidate-new",
      candidateUrl: candidate,
      bytes: audio.length,
      contentType: "audio/webm",
      cachedAt: 1,
    })
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-new"),
      caches,
      origin: ORIGIN,
    })

    await manager.overview()

    expect(await database.offlineMedium("track-1")).toBeDefined()
    await expect(
      readMapping(
        await (await caches.open(OFFLINE_MAP_CACHE)).match(
          streamMappingUrl(ORIGIN, "default", "device-1", "track-1"),
        ),
      ),
    ).resolves.toEqual({ candidateUrl: candidate })
  })

  test("publishes a pin only with complete candidate bytes", async () => {
    const blob = vi.spyOn(Response.prototype, "blob")
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const fetch = provider(() => "candidate-1")
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch,
      caches,
      origin: ORIGIN,
      now: () => 100,
    })

    const started = await manager.pinAlbum("album-1")
    expect(started.albums[0]).toMatchObject({ state: "downloading" })
    const overview = await manager.settle()

    expect(overview).toEqual({
      available: true,
      totalBytes: audio.length,
      albums: [
        {
          albumId: "album-1",
          state: "ready",
          totalTracks: 1,
          readyTracks: 1,
          bytes: audio.length,
        },
      ],
    })
    const stored = await database.offlineMedium("track-1")
    expect(stored).toMatchObject({ candidateId: "candidate-1", bytes: audio.length })
    expect(blob).not.toHaveBeenCalled()
    blob.mockRestore()
    const mapping = await readMapping(
      await (await caches.open(OFFLINE_MAP_CACHE)).match(
        streamMappingUrl(ORIGIN, "default", "device-1", "track-1"),
      ),
    )
    expect(mapping).toEqual({
      candidateUrl: stored?.candidateUrl,
      cacheName: OFFLINE_STAGING_CACHE,
    })
  })

  test("one cached shared track satisfies every pinned album that contains it", async () => {
    const database = await configuredDatabase()
    await database.putAlbum(album("album-2", ["track-1"]))
    const caches = new MemoryCaches()
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-1"),
      caches,
      origin: ORIGIN,
    })

    await manager.pinAlbum("album-1")
    await manager.settle()
    await manager.pinAlbum("album-2")
    const overview = await manager.settle()

    expect(overview.albums).toMatchObject([
      { albumId: "album-1", state: "ready", readyTracks: 1 },
      { albumId: "album-2", state: "ready", readyTracks: 1 },
    ])
    expect(await database.offlineMedium("track-1")).toMatchObject({
      albumIds: ["album-1", "album-2"],
    })
  })

  test("a new resolved candidate replaces the stale fidelity copy", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    let currentCandidate = "candidate-low"
    let clock = 0
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => currentCandidate),
      caches,
      origin: ORIGIN,
      now: () => clock,
    })
    await manager.pinAlbum("album-1")
    await manager.settle()
    const oldUrl = (await database.offlineMedium("track-1"))?.candidateUrl
    expect(oldUrl).toBeDefined()

    currentCandidate = "candidate-lossless"
    clock = 2 * 24 * 60 * 60 * 1000
    await manager.pinAlbum("album-1")
    await manager.settle()

    const stagingCache = await caches.open(OFFLINE_STAGING_CACHE)
    // The previous candidate gets a new grace window when it becomes orphaned, even when
    // its original download was already old.
    if (oldUrl !== undefined) expect(await stagingCache.match(oldUrl)).toBeDefined()
    clock += 25 * 60 * 60 * 1000
    await manager.overview()
    if (oldUrl !== undefined) expect(await stagingCache.match(oldUrl)).toBeUndefined()
    const upgraded = await database.offlineMedium("track-1")
    expect(upgraded).toMatchObject({
      candidateId: "candidate-lossless",
      cacheName: OFFLINE_STAGING_CACHE,
    })
    expect(
      upgraded === undefined ? undefined : await stagingCache.match(upgraded.candidateUrl),
    ).toBeDefined()
  })

  test("a truncated download leaves no ready record or partial cache entry", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-1", true),
      caches,
      origin: ORIGIN,
    })

    await manager.pinAlbum("album-1")
    const failed = await manager.settle()

    expect(failed.albums[0]).toMatchObject({
      state: "failed",
      error: expect.stringContaining("truncated"),
    })
    expect(await database.offlineMedium("track-1")).toBeUndefined()
    expect((await manager.overview()).albums[0]).toMatchObject({ state: "failed" })
    expect((await caches.open(OFFLINE_MEDIA_CACHE)).rows.size).toBe(0)
    expect((await caches.open(OFFLINE_STAGING_CACHE)).rows.size).toBe(0)
    expect((await caches.open(OFFLINE_MAP_CACHE)).rows.size).toBe(0)
  })

  test("a later retry restarts cleanly after interruption", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const broken = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-1", true),
      caches,
      origin: ORIGIN,
    })
    await broken.pinAlbum("album-1")
    await broken.settle()

    const working = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-1"),
      caches,
      origin: ORIGIN,
    })
    await working.resume()
    const overview = await working.settle()

    expect(overview.albums[0]).toMatchObject({ state: "ready", readyTracks: 1 })
    expect(await database.offlineMedium("track-1")).toBeDefined()
  })

  test("unpinning cancels an in-flight download without recreating its pin", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    let release: (() => void) | undefined
    let calls = 0
    const request = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1
      if (new Headers(init?.headers).has("range")) {
        return new Response(audio.slice(0, 1), {
          status: 206,
          headers: { [CANDIDATE_ID_HEADER]: "candidate-1" },
        })
      }
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return new Response(audio, {
        headers: {
          "content-length": String(audio.length),
          [CANDIDATE_ID_HEADER]: "candidate-1",
        },
      })
    }) as unknown as typeof globalThis.fetch
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: request,
      caches,
      origin: ORIGIN,
    })
    const otherTab = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: request,
      caches,
      origin: ORIGIN,
    })

    const pinning = manager.pinAlbum("album-1").catch(() => undefined)
    await vi.waitFor(() => expect(calls).toBeGreaterThan(1))
    const unpinning = otherTab.unpinAlbum("album-1")
    release?.()
    await Promise.all([pinning, unpinning])
    await manager.settle()

    expect(await database.offlinePin("album-1")).toMatchObject({
      pinned: false,
      generation: 2,
    })
    expect(await database.offlineMedium("track-1")).toBeUndefined()
    expect((await caches.open(OFFLINE_MAP_CACHE)).rows.size).toBe(0)
  })

  test("clearing for an account switch fences an old in-flight download", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    let release: (() => void) | undefined
    let fullStarted = false
    const request = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (new Headers(init?.headers).has("range")) {
        return new Response(audio.slice(0, 1), {
          status: 206,
          headers: { [CANDIDATE_ID_HEADER]: "old-account-candidate" },
        })
      }
      fullStarted = true
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return new Response(audio, {
        headers: {
          "content-length": String(audio.length),
          [CANDIDATE_ID_HEADER]: "old-account-candidate",
        },
      })
    }) as unknown as typeof globalThis.fetch
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: request,
      caches,
      origin: ORIGIN,
    })
    const otherTab = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: request,
      caches,
      origin: ORIGIN,
    })

    const pinning = manager.pinAlbum("album-1").catch(() => undefined)
    await vi.waitFor(() => expect(fullStarted).toBe(true))
    const clearing = otherTab.clear()
    release?.()
    await Promise.all([pinning, clearing])
    await manager.settle()

    expect(await database.offlinePins()).toEqual([])
    expect(await database.offlineMedia()).toEqual([])
    expect((await caches.open(OFFLINE_MAP_CACHE)).rows.size).toBe(0)
    expect((await caches.open(OFFLINE_MEDIA_CACHE)).rows.size).toBe(0)
  })

  test("a slow tab cannot overwrite a newer resolved candidate", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    let currentCandidate = "candidate-old"
    let releaseOld: (() => void) | undefined
    let oldFullStarted = false
    let delayed = false
    const slowFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (new Headers(init?.headers).has("range")) {
        return new Response(audio.slice(0, 1), {
          status: 206,
          headers: { [CANDIDATE_ID_HEADER]: currentCandidate },
        })
      }
      const captured = currentCandidate
      oldFullStarted = true
      if (!delayed) {
        delayed = true
        await new Promise<void>((resolve) => {
          releaseOld = resolve
        })
      }
      return new Response(audio, {
        headers: {
          "content-length": String(audio.length),
          [CANDIDATE_ID_HEADER]: captured,
        },
      })
    }) as unknown as typeof fetch
    const fastFetch = provider(() => currentCandidate)
    const slow = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: slowFetch,
      caches,
      origin: ORIGIN,
    })
    const fast = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: fastFetch,
      caches,
      origin: ORIGIN,
    })

    const old = slow.pinAlbum("album-1").catch(() => undefined)
    await vi.waitFor(() => expect(oldFullStarted).toBe(true))
    currentCandidate = "candidate-lossless"
    const upgraded = fast.pinAlbum("album-1")
    releaseOld?.()
    await Promise.all([old, upgraded])
    await Promise.all([slow.settle(), fast.settle()])

    expect(await database.offlinePin("album-1")).toMatchObject({
      pinned: true,
      generation: 2,
    })
    expect((await database.offlinePin("album-1"))?.lastError).toBeUndefined()
    expect(await database.offlineMedium("track-1")).toMatchObject({
      candidateId: "candidate-lossless",
    })
    const mapping = await readMapping(
      await (await caches.open(OFFLINE_MAP_CACHE)).match(
        streamMappingUrl(ORIGIN, "default", "device-1", "track-1"),
      ),
    )
    expect(mapping?.candidateUrl).toContain("candidate-lossless")
  })

  test("a quota retry evicts only unpinned, non-playing media", async () => {
    const database = await configuredDatabase()
    const caches = new MemoryCaches()
    const oldUrl = candidateUrl(ORIGIN, "default", "device-1", "candidate-old")
    const currentUrl = candidateUrl(ORIGIN, "default", "device-1", "candidate-current")
    await database.putOfflineMedium({
      id: "old",
      trackId: "old",
      albumIds: ["old-album"],
      candidateId: "candidate-old",
      candidateUrl: oldUrl,
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 1,
    })
    await database.putOfflineMedium({
      id: "current",
      trackId: "current",
      albumIds: ["current-album"],
      candidateId: "candidate-current",
      candidateUrl: currentUrl,
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 2,
    })
    await database.putSession(session("current"))
    const mediaCache = await caches.open(OFFLINE_MEDIA_CACHE)
    await mediaCache.put(oldUrl, new Response(audio))
    await mediaCache.put(currentUrl, new Response(audio))
    const mapCache = await caches.open(OFFLINE_MAP_CACHE)
    await mapCache.put(
      streamMappingUrl(ORIGIN, "default", "device-1", "old"),
      mappingResponse({ candidateUrl: oldUrl }),
    )
    await mapCache.put(
      streamMappingUrl(ORIGIN, "default", "device-1", "current"),
      mappingResponse({ candidateUrl: currentUrl }),
    )
    const stagingCache = await caches.open(OFFLINE_STAGING_CACHE)
    vi.spyOn(stagingCache, "put").mockRejectedValueOnce(
      new DOMException("full", "QuotaExceededError"),
    )
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-new"),
      caches,
      origin: ORIGIN,
    })

    await manager.pinAlbum("album-1")
    await manager.settle()

    expect(await database.offlineMedium("old")).toBeUndefined()
    expect(await database.offlineMedium("current")).toBeDefined()
    expect(await database.offlineMedium("track-1")).toBeDefined()
  })

  test("storage pressure evicts old unpinned bytes but keeps the playing track", async () => {
    let usage = 900 * 1024 * 1024
    const oldUrl = candidateUrl(ORIGIN, "default", "device-1", "candidate-old")
    const caches = new MemoryCaches((key) => {
      if (key === oldUrl) usage = 500 * 1024 * 1024
    })
    const database = await configuredDatabase()
    await database.putOfflineMedium({
      id: "old",
      trackId: "old",
      albumIds: ["old-album"],
      candidateId: "candidate-old",
      candidateUrl: oldUrl,
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 1,
    })
    const currentUrl = candidateUrl(ORIGIN, "default", "device-1", "candidate-current")
    await database.putOfflineMedium({
      id: "current",
      trackId: "current",
      albumIds: ["current-album"],
      candidateId: "candidate-current",
      candidateUrl: currentUrl,
      bytes: 100,
      contentType: "audio/webm",
      cachedAt: 2,
    })
    await database.putSession(session("current"))
    const mediaCache = await caches.open(OFFLINE_MEDIA_CACHE)
    await mediaCache.put(oldUrl, new Response(audio))
    await mediaCache.put(currentUrl, new Response(audio))
    const mapCache = await caches.open(OFFLINE_MAP_CACHE)
    await mapCache.put(
      streamMappingUrl(ORIGIN, "default", "device-1", "old"),
      mappingResponse({ candidateUrl: oldUrl }),
    )
    await mapCache.put(
      streamMappingUrl(ORIGIN, "default", "device-1", "current"),
      mappingResponse({ candidateUrl: currentUrl }),
    )
    const manager = createOfflineDownloadManager(() => Promise.resolve(database), {
      fetch: provider(() => "candidate-new"),
      caches,
      estimate: async () => ({ usage, quota: 1024 * 1024 * 1024 }),
      origin: ORIGIN,
    })

    await manager.pinAlbum("album-1")
    await manager.settle()

    expect(await database.offlineMedium("old")).toBeUndefined()
    expect(await database.offlineMedium("current")).toBeDefined()
  })
})
