import type {
  OfflineAlbumStatus,
  OfflineMedia,
  OfflineOverview,
  OfflinePin,
  WorkerDatabase,
  WorkerSettings,
} from "./contract"
import {
  ACCOUNT_ID_HEADER,
  audioManifestResponse,
  CANDIDATE_ID_HEADER,
  candidateUrl,
  chunkUrl,
  DEVICE_ID_HEADER,
  mappingResponse,
  OFFLINE_AUDIO_KIND,
  OFFLINE_CHUNK_BYTES,
  OFFLINE_MAP_CACHE,
  OFFLINE_MEDIA_CACHE,
  OFFLINE_STAGING_CACHE,
  readAudioManifest,
  readMapping,
  streamMappingUrl,
  streamUrl,
} from "./offline-cache"
import { type StorageEstimateLike, selectEvictionOrder, storageIsPressured } from "./offline-policy"

export interface OfflineCache {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
  delete(key: string): Promise<boolean>
  keys?(): Promise<readonly string[]>
}

export interface OfflineCacheStorage {
  open(name: string): Promise<OfflineCache>
  delete(name: string): Promise<boolean>
}

export interface OfflineDownloadEnvironment {
  readonly fetch: typeof fetch
  readonly caches: OfflineCacheStorage
  readonly estimate?: () => Promise<StorageEstimateLike>
  readonly now?: () => number
  readonly origin: string
  readonly available?: boolean
  /// Cross-tab critical section. Production supplies Web Locks; tests and non-browser
  /// callers share the module fallback by origin.
  readonly exclusive?: <T>(operation: () => Promise<T>) => Promise<T>
}

export interface OfflineDownloadManager {
  overview(expectedAccountId?: string): Promise<OfflineOverview>
  pinAlbum(albumId: string, expectedAccountId?: string): Promise<OfflineOverview>
  unpinAlbum(albumId: string, expectedAccountId?: string): Promise<OfflineOverview>
  resume(expectedAccountId?: string): Promise<OfflineOverview>
  touch(trackId: string): Promise<void>
  clear(expectedAccountId?: string): Promise<void>
  /// Test/diagnostic gate. Page operations intentionally return while bytes continue.
  settle(expectedAccountId?: string): Promise<OfflineOverview>
  exclusive<T>(operation: () => Promise<T>): Promise<T>
  clearWithinExclusive(): Promise<void>
}

interface OperationIdentity {
  readonly epoch: number
  readonly albumVersion: number
  readonly pinGeneration: number
  readonly albumRevision: number
  readonly accountId: string
  readonly deviceId: string
}

interface InflightAlbum extends OperationIdentity {
  readonly promise: Promise<void>
}

class DownloadCancelledError extends Error {}
class RetryDownloadError extends Error {}

const fallbackLocks = new Map<string, Promise<void>>()

export function browserOfflineExclusive(
  locks: LockManager | undefined,
): <T>(operation: () => Promise<T>) => Promise<T> {
  if (locks !== undefined) {
    return (operation) =>
      locks.request("pyxis-offline-media", () => operation()) as unknown as Promise<
        Awaited<ReturnType<typeof operation>>
      >
  }
  return async (operation) => {
    const key = "browser-fallback"
    const previous = fallbackLocks.get(key) ?? Promise.resolve()
    let release: (() => void) | undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    fallbackLocks.set(
      key,
      previous.then(() => current),
    )
    await previous
    try {
      return await operation()
    } finally {
      release?.()
      if (fallbackLocks.get(key) === current) fallbackLocks.delete(key)
    }
  }
}

export function browserCacheStorage(storage: CacheStorage): OfflineCacheStorage {
  return {
    open: async (name) => {
      const cache = await storage.open(name)
      return {
        match: async (key) => (await cache.match(key)) ?? undefined,
        put: async (key, response) => cache.put(key, response),
        delete: async (key) => cache.delete(key),
        keys: async () => (await cache.keys()).map((request) => request.url),
      }
    },
    delete: async (name) => storage.delete(name),
  }
}

export function createOfflineDownloadManager(
  database: () => Promise<WorkerDatabase>,
  environment: OfflineDownloadEnvironment,
): OfflineDownloadManager {
  const inflight = new Map<string, InflightAlbum>()
  const albumVersions = new Map<string, number>()
  const now = environment.now ?? Date.now
  const runExclusive = environment.exclusive ?? browserOfflineExclusive(undefined)
  let epoch = 0

  const versionOf = (albumId: string): number => albumVersions.get(albumId) ?? 0
  const bumpAlbum = (albumId: string): number => {
    const version = versionOf(albumId) + 1
    albumVersions.set(albumId, version)
    return version
  }
  const assertCurrent = (albumId: string, operation: OperationIdentity): void => {
    if (operation.epoch !== epoch || operation.albumVersion !== versionOf(albumId)) {
      throw new DownloadCancelledError("offline download was cancelled")
    }
  }

  const overview = async (expectedAccountId?: string): Promise<OfflineOverview> =>
    runExclusive(async () => {
      const store = await database()
      if (
        expectedAccountId !== undefined &&
        (await store.settings()).accountId !== expectedAccountId
      ) {
        throw new Error("this page belongs to a different account; reload it")
      }
      await reconcileCachesWithinExclusive()
      const [allPins, media] = await Promise.all([store.offlinePins(), store.offlineMedia()])
      const pins = allPins.filter((pin) => pin.pinned !== false)
      const albums = await Promise.all(
        pins.map(async (pin): Promise<OfflineAlbumStatus> => {
          const album = await store.album(pin.albumId)
          const tracks = album?.tracks ?? []
          const trackIds = new Set(tracks.map((track) => track.id))
          const cached = media.filter(
            (entry) => entry.albumIds.includes(pin.albumId) && trackIds.has(entry.trackId),
          )
          const bytes = cached.reduce((total, entry) => total + entry.bytes, 0)
          const active = inflight.get(pin.albumId)
          const state =
            active !== undefined && active.albumVersion === versionOf(pin.albumId)
              ? "downloading"
              : pin.lastError !== undefined
                ? "failed"
                : tracks.length > 0 && cached.length === tracks.length
                  ? "ready"
                  : "downloading"
          return {
            albumId: pin.albumId,
            state,
            totalTracks: tracks.length,
            readyTracks: cached.length,
            bytes,
            ...(pin.lastError === undefined ? {} : { error: pin.lastError }),
          }
        }),
      )
      return {
        available: environment.available !== false,
        albums,
        totalBytes: media.reduce((total, entry) => total + entry.bytes, 0),
      }
    })

  const removeTrack = async (trackId: string): Promise<boolean> => {
    const store = await database()
    const media = await store.offlineMedium(trackId)
    if (media === undefined) return false
    const [candidateCache, mapCache, settings] = await Promise.all([
      environment.caches.open(media.cacheName ?? OFFLINE_MEDIA_CACHE),
      environment.caches.open(OFFLINE_MAP_CACHE),
      store.settings(),
    ])
    if (settings.accountId !== undefined && settings.deviceId !== undefined) {
      const mappingKey = streamMappingUrl(
        environment.origin,
        settings.accountId,
        settings.deviceId,
        trackId,
      )
      const mapping = await readMapping(await mapCache.match(mappingKey))
      if (
        mapping?.candidateUrl === media.candidateUrl &&
        (mapping.cacheName ?? OFFLINE_MEDIA_CACHE) === (media.cacheName ?? OFFLINE_MEDIA_CACHE)
      ) {
        await mapCache.delete(mappingKey)
      }
    }
    await deleteCachedCandidate(candidateCache, media.candidateUrl)
    await store.removeOfflineMedium(trackId)
    return true
  }

  const reconcileCachesWithinExclusive = async (): Promise<void> => {
    const store = await database()
    const [settings, records, mediaCache, mapCache, stagingCache] = await Promise.all([
      store.settings(),
      store.offlineMedia(),
      environment.caches.open(OFFLINE_MEDIA_CACHE),
      environment.caches.open(OFFLINE_MAP_CACHE),
      environment.caches.open(OFFLINE_STAGING_CACHE),
    ])
    const mediaCandidateUrls = new Set(
      records
        .filter((record) => record.cacheName !== OFFLINE_STAGING_CACHE)
        .map((record) => record.candidateUrl),
    )
    const stagingCandidateUrls = new Set(
      records
        .filter((record) => record.cacheName === OFFLINE_STAGING_CACHE)
        .map((record) => record.candidateUrl),
    )
    const expectedMappings = new Map<string, string>()
    if (settings.accountId !== undefined && settings.deviceId !== undefined) {
      for (const record of records) {
        expectedMappings.set(
          streamMappingUrl(
            environment.origin,
            settings.accountId,
            settings.deviceId,
            record.trackId,
          ),
          `${record.cacheName ?? OFFLINE_MEDIA_CACHE}|${record.candidateUrl}`,
        )
      }
    }
    for (const key of (await mediaCache.keys?.()) ?? []) {
      if (!mediaCandidateUrls.has(key)) await mediaCache.delete(key)
    }
    for (const key of (await mapCache.keys?.()) ?? []) {
      const mapping = await readMapping(await mapCache.match(key))
      const actual =
        mapping === undefined
          ? undefined
          : `${mapping.cacheName ?? OFFLINE_MEDIA_CACHE}|${mapping.candidateUrl}`
      if (actual !== expectedMappings.get(key)) await mapCache.delete(key)
    }
    const stagingExpiry = now() - 24 * 60 * 60 * 1000
    const stagingKeys = new Set((await stagingCache.keys?.()) ?? [])
    for (const key of stagingKeys) {
      const referenced = [...stagingCandidateUrls].some(
        (candidate) => key === candidate || key.startsWith(`${candidate}:chunk:`),
      )
      if (referenced) continue
      const chunkMarker = key.lastIndexOf(":chunk:")
      if (chunkMarker >= 0 && stagingKeys.has(key.slice(0, chunkMarker))) continue
      const staged = await stagingCache.match(key)
      const stagedAt = Number(staged?.headers.get("x-pyxis-staged-at") ?? "0")
      if (!Number.isFinite(stagedAt) || stagedAt >= stagingExpiry) continue
      if (chunkMarker >= 0) await stagingCache.delete(key)
      else await deleteCachedCandidate(stagingCache, key)
    }
    for (const record of records) {
      const mappingKey =
        settings.accountId === undefined || settings.deviceId === undefined
          ? undefined
          : streamMappingUrl(
              environment.origin,
              settings.accountId,
              settings.deviceId,
              record.trackId,
            )
      const mapping =
        mappingKey === undefined ? undefined : await readMapping(await mapCache.match(mappingKey))
      const selectedCache = record.cacheName === OFFLINE_STAGING_CACHE ? stagingCache : mediaCache
      if (!(await candidateIsComplete(selectedCache, record.candidateUrl))) {
        await store.removeOfflineMedium(record.trackId)
        continue
      }
      if (
        mappingKey !== undefined &&
        (mapping?.candidateUrl !== record.candidateUrl ||
          (mapping.cacheName ?? OFFLINE_MEDIA_CACHE) !== (record.cacheName ?? OFFLINE_MEDIA_CACHE))
      ) {
        await mapCache.put(
          mappingKey,
          mappingResponse({
            candidateUrl: record.candidateUrl,
            ...(record.cacheName === undefined ? {} : { cacheName: record.cacheName }),
          }),
        )
      }
    }
  }

  const evictionOrder = async (retainTrackId: string): Promise<readonly string[]> => {
    const store = await database()
    const [pins, media, sessions] = await Promise.all([
      store.offlinePins(),
      store.offlineMedia(),
      store.sessions(),
    ])
    const pinnedAlbums = new Set(
      pins.filter((pin) => pin.pinned !== false).map((pin) => pin.albumId),
    )
    const retain = new Set<string>([
      retainTrackId,
      ...media
        .filter((entry) => entry.albumIds.some((albumId) => pinnedAlbums.has(albumId)))
        .map((entry) => entry.trackId),
      ...sessions.flatMap((session) =>
        session.transport === "playing" && session.currentTrackId !== undefined
          ? [session.currentTrackId]
          : [],
      ),
    ])
    return selectEvictionOrder(media, retain)
  }

  const evictForSpace = async (retainTrackId: string): Promise<void> => {
    if (environment.estimate === undefined) return
    if (!storageIsPressured(await environment.estimate())) return
    for (const trackId of await evictionOrder(retainTrackId)) {
      await removeTrack(trackId)
      if (!storageIsPressured(await environment.estimate())) return
    }
  }

  const pairedSettings = async (): Promise<
    Required<Pick<WorkerSettings, "accountId" | "bearerToken" | "deviceId">>
  > =>
    runExclusive(async () => {
      const settings = await (await database()).settings()
      if (
        settings.bearerToken === undefined ||
        settings.accountId === undefined ||
        settings.deviceId === undefined
      ) {
        throw new Error("offline downloads require a paired account")
      }
      return {
        accountId: settings.accountId,
        bearerToken: settings.bearerToken,
        deviceId: settings.deviceId,
      }
    })

  const reserveResolutionGeneration = async (operation: OperationIdentity): Promise<number> =>
    runExclusive(async () => {
      const store = await database()
      const settings = await store.settings()
      if (settings.accountId !== operation.accountId || settings.deviceId !== operation.deviceId) {
        throw new DownloadCancelledError("offline download belongs to an old account")
      }
      const generation = (settings.offlineResolutionGeneration ?? 0) + 1
      await store.writeSettings({ offlineResolutionGeneration: generation })
      return generation
    })

  const assertDurableContext = async (
    pin: OfflinePin,
    settings: Required<Pick<WorkerSettings, "accountId" | "bearerToken" | "deviceId">>,
    operation: OperationIdentity,
    trackId?: string,
  ): Promise<void> => {
    assertCurrent(pin.albumId, operation)
    const store = await database()
    const currentSettings = await store.settings()
    const album = await store.album(pin.albumId)
    if (
      settings.accountId !== operation.accountId ||
      settings.deviceId !== operation.deviceId ||
      currentSettings.accountId !== operation.accountId ||
      currentSettings.deviceId !== operation.deviceId ||
      (await store.offlinePin(pin.albumId))?.generation !== operation.pinGeneration ||
      (await store.offlinePin(pin.albumId))?.pinned === false ||
      album?.revision !== operation.albumRevision ||
      (trackId !== undefined && !album.tracks.some((track) => track.id === trackId))
    ) {
      throw new DownloadCancelledError("offline download no longer belongs to this account")
    }
  }

  const probeCandidate = async (
    settings: Required<Pick<WorkerSettings, "accountId" | "bearerToken" | "deviceId">>,
    requestUrl: string,
  ): Promise<{ candidateId: string; response: Response }> => {
    const response = await environment.fetch(requestUrl, {
      headers: {
        authorization: `Bearer ${settings.bearerToken}`,
        [ACCOUNT_ID_HEADER]: settings.accountId,
        [DEVICE_ID_HEADER]: settings.deviceId,
        range: "bytes=0-0",
        "x-pyxis-offline-refresh": "1",
      },
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`offline probe failed with HTTP ${response.status}`)
    const candidateId = response.headers.get(CANDIDATE_ID_HEADER)
    if (candidateId === null || candidateId.length === 0) {
      throw new Error("stream response carried no candidate identity")
    }
    return { candidateId, response }
  }

  const downloadTrack = async (
    pin: OfflinePin,
    trackId: string,
    operation: OperationIdentity,
  ): Promise<OfflineMedia> => {
    assertCurrent(pin.albumId, operation)
    const settings = await pairedSettings()
    if (settings.accountId !== operation.accountId || settings.deviceId !== operation.deviceId) {
      throw new DownloadCancelledError("offline download belongs to an old account")
    }
    const requestUrl = streamUrl(environment.origin, trackId)
    const mappingKey = streamMappingUrl(
      environment.origin,
      settings.accountId,
      settings.deviceId,
      trackId,
    )
    const probe = await probeCandidate(settings, requestUrl)
    assertCurrent(pin.albumId, operation)

    const existing = await runExclusive(async () => {
      await assertDurableContext(pin, settings, operation, trackId)
      return (await database()).offlineMedium(trackId)
    })
    const [mediaCache, mapCache, stagingCache] = await Promise.all([
      environment.caches.open(OFFLINE_MEDIA_CACHE),
      environment.caches.open(OFFLINE_MAP_CACHE),
      environment.caches.open(OFFLINE_STAGING_CACHE),
    ])
    const existingCache = existing?.cacheName === OFFLINE_STAGING_CACHE ? stagingCache : mediaCache
    const existingMapping = await readMapping(await mapCache.match(mappingKey))
    if (
      existing?.candidateId === probe.candidateId &&
      (await candidateIsComplete(existingCache, existing.candidateUrl)) &&
      existingMapping?.candidateUrl === existing.candidateUrl &&
      (existingMapping.cacheName ?? OFFLINE_MEDIA_CACHE) ===
        (existing.cacheName ?? OFFLINE_MEDIA_CACHE)
    ) {
      try {
        const generation = await reserveResolutionGeneration(operation)
        const confirmation = await probeCandidate(settings, requestUrl)
        await confirmation.response.body?.cancel()
        if (confirmation.candidateId !== probe.candidateId) throw new RetryDownloadError()
        const reused = await runExclusive(async () => {
          await assertDurableContext(pin, settings, operation, trackId)
          const currentStore = await database()
          const latest = await currentStore.offlineMedium(trackId)
          const latestMapping = await readMapping(await mapCache.match(mappingKey))
          if (
            latest?.candidateId !== probe.candidateId ||
            (latest.resolutionGeneration ?? 0) > generation ||
            !(await candidateIsComplete(
              latest.cacheName === OFFLINE_STAGING_CACHE ? stagingCache : mediaCache,
              latest.candidateUrl,
            )) ||
            latestMapping?.candidateUrl !== latest.candidateUrl ||
            (latestMapping.cacheName ?? OFFLINE_MEDIA_CACHE) !==
              (latest.cacheName ?? OFFLINE_MEDIA_CACHE)
          ) {
            throw new RetryDownloadError()
          }
          return currentStore.putOfflineMedium({
            ...latest,
            albumIds: [...new Set([...latest.albumIds, pin.albumId])],
            resolutionGeneration: generation,
          })
        })
        await probe.response.body?.cancel()
        return reused
      } catch (cause) {
        await probe.response.body?.cancel()
        if (cause instanceof RetryDownloadError) return downloadTrack(pin, trackId, operation)
        throw cause
      }
    }

    await runExclusive(async () => {
      const currentSettings = await (await database()).settings()
      if (
        currentSettings.accountId !== operation.accountId ||
        currentSettings.deviceId !== operation.deviceId
      ) {
        throw new DownloadCancelledError("offline download belongs to an old account")
      }
      await evictForSpace(trackId)
    }).catch((cause: unknown) => {
      if (cause instanceof DownloadCancelledError) throw cause
    })
    assertCurrent(pin.albumId, operation)
    const response =
      probe.response.status === 200
        ? probe.response
        : await environment.fetch(requestUrl, {
            headers: {
              authorization: `Bearer ${settings.bearerToken}`,
              [ACCOUNT_ID_HEADER]: settings.accountId,
              [DEVICE_ID_HEADER]: settings.deviceId,
              "x-pyxis-offline-refresh": "1",
            },
            cache: "no-store",
          })
    if (!response.ok) throw new Error(`offline download failed with HTTP ${response.status}`)
    const candidateId = response.headers.get(CANDIDATE_ID_HEADER)
    if (candidateId === null || candidateId.length === 0) {
      throw new Error("stream response carried no candidate identity")
    }
    const declared = Number(response.headers.get("content-length") ?? "0")
    const contentType = response.headers.get("content-type") ?? "application/octet-stream"
    const resolvedCandidateUrl = candidateUrl(
      environment.origin,
      settings.accountId,
      settings.deviceId,
      candidateId,
    )
    const stagingUrl = `${resolvedCandidateUrl}:staging:${crypto.randomUUID()}`
    let bytes: number
    try {
      bytes = await stageResponse(stagingCache, stagingUrl, response, {
        candidateId,
        contentType,
        declared,
        stagedAt: now(),
      })
    } catch (cause) {
      if (isQuotaError(cause)) {
        const evicted = await runExclusive(async () => {
          const oldest = (await evictionOrder(trackId))[0]
          if (oldest === undefined) return false
          await removeTrack(oldest)
          return true
        })
        if (evicted) return downloadTrack(pin, trackId, operation)
      }
      throw cause
    }

    assertCurrent(pin.albumId, operation)
    const generation = await reserveResolutionGeneration(operation)
    const confirmation = await probeCandidate(settings, requestUrl)
    await confirmation.response.body?.cancel()
    if (confirmation.candidateId !== candidateId) {
      await deleteCachedCandidate(stagingCache, stagingUrl)
      return downloadTrack(pin, trackId, operation)
    }

    try {
      return await runExclusive(async () => {
        await assertDurableContext(pin, settings, operation, trackId)
        const currentStore = await database()
        const previousMapping = await mapCache.match(mappingKey)
        const previousRecord = await currentStore.offlineMedium(trackId)
        if ((previousRecord?.resolutionGeneration ?? 0) > generation) {
          throw new RetryDownloadError()
        }
        try {
          if ((await stagingCache.match(stagingUrl)) === undefined) {
            throw new RetryDownloadError()
          }
          const stored = await currentStore.putOfflineMedium({
            id: trackId,
            trackId,
            albumIds: [...new Set([...(previousRecord?.albumIds ?? []), pin.albumId])],
            candidateId,
            candidateUrl: stagingUrl,
            cacheName: OFFLINE_STAGING_CACHE,
            bytes,
            contentType,
            cachedAt: now(),
            resolutionGeneration: generation,
          })
          await mapCache.put(
            mappingKey,
            mappingResponse({
              candidateUrl: stagingUrl,
              cacheName: OFFLINE_STAGING_CACHE,
            }),
          )
          // Keep the previous candidate until orphan reconciliation's grace period. A
          // service-worker range stream may still be reading chunks from it.
          if (
            previousRecord?.cacheName === OFFLINE_STAGING_CACHE &&
            previousRecord.candidateUrl !== stagingUrl
          ) {
            await refreshCandidateGrace(stagingCache, previousRecord.candidateUrl, now()).catch(
              () => undefined,
            )
          }
          return stored
        } catch (cause) {
          if (previousMapping === undefined) await mapCache.delete(mappingKey)
          else await mapCache.put(mappingKey, previousMapping)
          const published = await currentStore.offlineMedium(trackId)
          if (published?.candidateUrl === stagingUrl) {
            if (previousRecord === undefined) await currentStore.removeOfflineMedium(trackId)
            else await currentStore.putOfflineMedium(previousRecord)
          }
          if (isQuotaError(cause)) {
            const oldest = (await evictionOrder(trackId))[0]
            if (oldest !== undefined) {
              await removeTrack(oldest)
              throw new RetryDownloadError()
            }
          }
          throw cause
        }
      })
    } catch (cause) {
      await deleteCachedCandidate(stagingCache, stagingUrl)
      if (cause instanceof RetryDownloadError) return downloadTrack(pin, trackId, operation)
      throw cause
    }
  }

  const downloadAlbum = async (albumId: string, operation: OperationIdentity): Promise<void> => {
    const { album, pin } = await runExclusive(async () => {
      assertCurrent(albumId, operation)
      const store = await database()
      const settings = await store.settings()
      if (settings.accountId !== operation.accountId || settings.deviceId !== operation.deviceId) {
        throw new DownloadCancelledError("offline download belongs to an old account")
      }
      const album = await store.album(albumId)
      if (album === undefined) throw new DownloadCancelledError("album was removed")
      if (album.tracks.length === 0) throw new Error("album has no tracks to download")
      const pin = await store.offlinePin(albumId)
      if (pin?.generation !== operation.pinGeneration || pin.pinned === false) {
        throw new DownloadCancelledError("album is no longer pinned")
      }
      const { lastError: _lastError, ...clearPin } = pin
      await store.putOfflinePin(clearPin)
      return { album, pin: clearPin }
    })
    try {
      for (const track of album.tracks) {
        assertCurrent(albumId, operation)
        await downloadTrack(pin, track.id, operation)
      }
      await runExclusive(async () => {
        assertCurrent(albumId, operation)
        const store = await database()
        const settings = await store.settings()
        const current = await store.offlinePin(albumId)
        if (
          settings.accountId !== operation.accountId ||
          settings.deviceId !== operation.deviceId ||
          current?.generation !== operation.pinGeneration ||
          current.pinned === false ||
          (await store.album(albumId)) === undefined
        ) {
          throw new DownloadCancelledError("album is no longer pinned")
        }
        await store.putOfflinePin({
          id: albumId,
          albumId,
          pinnedAt: current.pinnedAt,
          generation: current.generation,
          pinned: true,
        })
      })
    } catch (cause) {
      if (cause instanceof DownloadCancelledError) throw cause
      const failure = cause instanceof Error ? cause.message : "offline download failed"
      await runExclusive(async () => {
        if (operation.epoch !== epoch || operation.albumVersion !== versionOf(albumId)) return
        const store = await database()
        const settings = await store.settings()
        const current = await store.offlinePin(albumId)
        if (
          settings.accountId === operation.accountId &&
          settings.deviceId === operation.deviceId &&
          current?.generation === operation.pinGeneration &&
          current.pinned !== false &&
          (await store.album(albumId)) !== undefined
        ) {
          await store.putOfflinePin({ ...current, lastError: failure })
        }
      })
      throw cause
    }
  }

  const ensureAlbum = async (albumId: string, operation: OperationIdentity): Promise<void> => {
    const existing = inflight.get(albumId)
    if (
      existing !== undefined &&
      existing.epoch === operation.epoch &&
      existing.albumVersion === operation.albumVersion &&
      existing.pinGeneration === operation.pinGeneration &&
      existing.albumRevision === operation.albumRevision
    ) {
      return existing.promise
    }
    const promise = downloadAlbum(albumId, operation).finally(() => {
      if (inflight.get(albumId)?.promise === promise) inflight.delete(albumId)
    })
    inflight.set(albumId, { ...operation, promise })
    return promise
  }

  const clearWithinExclusive = async (): Promise<void> => {
    epoch += 1
    const store = await database()
    await Promise.all([
      environment.caches.delete(OFFLINE_MEDIA_CACHE),
      environment.caches.delete(OFFLINE_MAP_CACHE),
      environment.caches.delete(OFFLINE_STAGING_CACHE),
    ])
    for (const media of await store.offlineMedia()) await store.removeOfflineMedium(media.trackId)
    for (const pin of await store.offlinePins()) await store.removeOfflinePin(pin.albumId)
  }

  return {
    overview,
    async pinAlbum(albumId, expectedAccountId) {
      if (environment.available === false) {
        throw new Error("offline downloads require cross-tab Web Locks support")
      }
      const albumVersion = bumpAlbum(albumId)
      const identity = await runExclusive(async () => {
        const store = await database()
        const settings = await store.settings()
        if (expectedAccountId !== undefined && settings.accountId !== expectedAccountId) {
          throw new Error("this page belongs to a different account; reload it")
        }
        if (settings.accountId === undefined || settings.deviceId === undefined) {
          throw new Error("offline downloads require a paired account")
        }
        const album = await store.album(albumId)
        if (album === undefined) {
          throw new Error("album is not in the local library")
        }
        const current = await store.offlinePin(albumId)
        const generation = (current?.generation ?? 0) + 1
        await store.putOfflinePin({
          id: albumId,
          albumId,
          pinnedAt: current?.pinnedAt ?? now(),
          generation,
          pinned: true,
        })
        return {
          pinGeneration: generation,
          albumRevision: album.revision,
          accountId: settings.accountId,
          deviceId: settings.deviceId,
        }
      })
      const operation = { epoch, albumVersion, ...identity }
      void ensureAlbum(albumId, operation).catch(() => undefined)
      return overview(expectedAccountId)
    },
    async unpinAlbum(albumId, expectedAccountId) {
      bumpAlbum(albumId)
      await runExclusive(async () => {
        const store = await database()
        if (
          expectedAccountId !== undefined &&
          (await store.settings()).accountId !== expectedAccountId
        ) {
          throw new Error("this page belongs to a different account; reload it")
        }
        const current = await store.offlinePin(albumId)
        if (current !== undefined) {
          const { lastError: _lastError, ...withoutError } = current
          await store.putOfflinePin({
            ...withoutError,
            generation: current.generation + 1,
            pinned: false,
          })
        }
      })
      return overview(expectedAccountId)
    },
    async resume(expectedAccountId) {
      if (environment.available === false) return overview(expectedAccountId)
      const snapshot = await runExclusive(async () => {
        const store = await database()
        const settings = await store.settings()
        if (expectedAccountId !== undefined && settings.accountId !== expectedAccountId) {
          throw new Error("this page belongs to a different account; reload it")
        }
        if (settings.accountId === undefined || settings.deviceId === undefined) {
          throw new Error("offline downloads require a paired account")
        }
        const pins = (await store.offlinePins()).filter((pin) => pin.pinned !== false)
        return {
          pins: await Promise.all(
            pins.map(async (pin) => ({ pin, album: await store.album(pin.albumId) })),
          ),
          accountId: settings.accountId,
          deviceId: settings.deviceId,
        }
      })
      for (const { pin, album } of snapshot.pins) {
        if (album === undefined) continue
        const operation = {
          epoch,
          albumVersion: versionOf(pin.albumId),
          pinGeneration: pin.generation,
          albumRevision: album.revision,
          accountId: snapshot.accountId,
          deviceId: snapshot.deviceId,
        }
        void ensureAlbum(pin.albumId, operation).catch(() => undefined)
      }
      return overview(expectedAccountId)
    },
    async touch(trackId) {
      await (await database()).touchOfflineMedium(trackId, now())
    },
    clear: (expectedAccountId) =>
      runExclusive(async () => {
        if (
          expectedAccountId !== undefined &&
          (await (await database()).settings()).accountId !== expectedAccountId
        ) {
          throw new Error("this page belongs to a different account; reload it")
        }
        await clearWithinExclusive()
      }),
    async settle(expectedAccountId) {
      await Promise.allSettled([...inflight.values()].map((entry) => entry.promise))
      return overview(expectedAccountId)
    },
    exclusive: runExclusive,
    clearWithinExclusive,
  }
}

async function stageResponse(
  cache: OfflineCache,
  candidate: string,
  response: Response,
  options: {
    readonly candidateId: string
    readonly contentType: string
    readonly declared: number
    readonly stagedAt: number
  },
): Promise<number> {
  if (response.body === null) throw new Error("offline download had no body")
  const reader = response.body.getReader()
  const written: string[] = []
  let pending = new Uint8Array(0)
  let bytes = 0
  let index = 0
  const writeChunk = async (chunk: Uint8Array) => {
    const key = chunkUrl(candidate, index)
    index += 1
    const body = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    ) as ArrayBuffer
    await cache.put(
      key,
      new Response(body, {
        headers: { "x-pyxis-staged-at": String(options.stagedAt) },
      }),
    )
    written.push(key)
  }
  try {
    while (true) {
      const read = await reader.read()
      if (read.done) break
      bytes += read.value.byteLength
      if (!Number.isSafeInteger(bytes)) throw new Error("offline download is too large")
      const combined = new Uint8Array(pending.byteLength + read.value.byteLength)
      combined.set(pending)
      combined.set(read.value, pending.byteLength)
      pending = combined
      while (pending.byteLength >= OFFLINE_CHUNK_BYTES) {
        await writeChunk(pending.slice(0, OFFLINE_CHUNK_BYTES))
        pending = pending.slice(OFFLINE_CHUNK_BYTES)
      }
    }
    if (pending.byteLength > 0) await writeChunk(pending)
    if (bytes === 0) throw new Error("offline download was empty")
    if (options.declared > 0 && options.declared !== bytes) {
      throw new Error(`offline download truncated at ${bytes} of ${options.declared} bytes`)
    }
    await cache.put(
      candidate,
      audioManifestResponse({
        kind: OFFLINE_AUDIO_KIND,
        chunks: index,
        bytes,
        contentType: options.contentType,
        candidateId: options.candidateId,
        stagedAt: options.stagedAt,
      }),
    )
    return bytes
  } catch (cause) {
    await Promise.all(written.map((key) => cache.delete(key)))
    await cache.delete(candidate)
    throw cause
  }
}

async function candidateIsComplete(cache: OfflineCache, candidate: string): Promise<boolean> {
  const response = await cache.match(candidate)
  if (response === undefined) return false
  const manifest = await readAudioManifest(response.clone())
  if (manifest === undefined) return true
  for (let index = 0; index < manifest.chunks; index += 1) {
    if ((await cache.match(chunkUrl(candidate, index))) === undefined) return false
  }
  return true
}

async function refreshCandidateGrace(
  cache: OfflineCache,
  candidate: string,
  stagedAt: number,
): Promise<void> {
  const manifest = await readAudioManifest((await cache.match(candidate))?.clone())
  if (manifest === undefined) return
  await cache.put(candidate, audioManifestResponse({ ...manifest, stagedAt }))
}

async function deleteCachedCandidate(cache: OfflineCache, candidate: string): Promise<void> {
  const response = await cache.match(candidate)
  const manifest = await readAudioManifest(response?.clone())
  if (manifest !== undefined) {
    for (let index = 0; index < manifest.chunks; index += 1) {
      await cache.delete(chunkUrl(candidate, index))
    }
  } else {
    for (const key of (await cache.keys?.()) ?? []) {
      if (key.startsWith(`${candidate}:chunk:`)) await cache.delete(key)
    }
  }
  await cache.delete(candidate)
}

function isQuotaError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "QuotaExceededError"
}
