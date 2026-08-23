// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { OfflineCache } from "../worker/downloads"
import {
  ACCOUNT_ID_HEADER,
  audioManifestResponse,
  candidateUrl,
  chunkUrl,
  DEVICE_ID_HEADER,
  mappingResponse,
  OFFLINE_AUDIO_KIND,
  OFFLINE_STAGING_CACHE,
  streamMappingUrl,
  streamUrl,
} from "../worker/offline-cache"
import { offlineStreamResponse } from "./offline-response"

class MemoryCache implements OfflineCache {
  readonly rows = new Map<string, Response>()
  async match(key: string): Promise<Response | undefined> {
    return this.rows.get(key)?.clone()
  }
  async put(key: string, response: Response): Promise<void> {
    this.rows.set(key, response.clone())
  }
  async delete(key: string): Promise<boolean> {
    return this.rows.delete(key)
  }
}

describe("offline service-worker media", () => {
  test("serves pinned bytes while the network is absent", async () => {
    const origin = "https://pyxis.test"
    const map = new MemoryCache()
    const media = new MemoryCache()
    const staging = new MemoryCache()
    const candidate = candidateUrl(origin, "default", "device-1", "candidate-1")
    await map.put(
      streamMappingUrl(origin, "default", "device-1", "track-1"),
      mappingResponse({ candidateUrl: candidate, cacheName: OFFLINE_STAGING_CACHE }),
    )
    const bytes = new TextEncoder().encode("offline audio")
    await staging.put(
      candidate,
      audioManifestResponse({
        kind: OFFLINE_AUDIO_KIND,
        chunks: 1,
        bytes: bytes.length,
        contentType: "audio/webm",
        candidateId: "candidate-1",
        stagedAt: 1,
      }),
    )
    await staging.put(chunkUrl(candidate, 0), new Response(bytes))

    const response = await offlineStreamResponse(
      new Request(streamUrl(origin, "track-1"), {
        headers: {
          [ACCOUNT_ID_HEADER]: "default",
          [DEVICE_ID_HEADER]: "device-1",
        },
      }),
      map,
      media,
      staging,
    )

    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe("offline audio")
  })

  test("a playback URL keeps its leased candidate after the track mapping changes", async () => {
    const origin = "https://pyxis.test"
    const map = new MemoryCache()
    const media = new MemoryCache()
    const staging = new MemoryCache()
    const leased = candidateUrl(origin, "default", "device-1", "candidate-old")
    const newer = candidateUrl(origin, "default", "device-1", "candidate-new")
    const bytes = new TextEncoder().encode("leased audio")
    await staging.put(
      leased,
      audioManifestResponse({
        kind: OFFLINE_AUDIO_KIND,
        chunks: 1,
        bytes: bytes.length,
        contentType: "audio/webm",
        candidateId: "candidate-old",
        stagedAt: 1,
      }),
    )
    await staging.put(chunkUrl(leased, 0), new Response(bytes))
    await map.put(
      streamMappingUrl(origin, "default", "device-1", "track-1"),
      mappingResponse({ candidateUrl: newer, cacheName: OFFLINE_STAGING_CACHE }),
    )
    const url = new URL(streamUrl(origin, "track-1"))
    url.searchParams.set("pyxisAccount", "default")
    url.searchParams.set("pyxisDevice", "device-1")
    url.searchParams.set("pyxisCandidate", leased)
    url.searchParams.set("pyxisCache", OFFLINE_STAGING_CACHE)

    const response = await offlineStreamResponse(new Request(url), map, media, staging)

    expect(await response?.text()).toBe("leased audio")
  })

  test("serves offline range requests for seeking", async () => {
    const origin = "https://pyxis.test"
    const map = new MemoryCache()
    const media = new MemoryCache()
    const candidate = candidateUrl(origin, "default", "device-1", "candidate-1")
    await map.put(
      streamMappingUrl(origin, "default", "device-1", "track-1"),
      mappingResponse({ candidateUrl: candidate }),
    )
    await media.put(candidate, new Response(new TextEncoder().encode("0123456789")))

    const response = await offlineStreamResponse(
      new Request(streamUrl(origin, "track-1"), {
        headers: {
          [ACCOUNT_ID_HEADER]: "default",
          [DEVICE_ID_HEADER]: "device-1",
          range: "bytes=2-5",
        },
      }),
      map,
      media,
    )

    expect(response?.status).toBe(206)
    expect(await response?.text()).toBe("2345")
  })

  test("never serves another account or reset device's mapping", async () => {
    const origin = "https://pyxis.test"
    const map = new MemoryCache()
    const media = new MemoryCache()
    const candidate = candidateUrl(origin, "default", "device-1", "candidate-1")
    await map.put(
      streamMappingUrl(origin, "default", "device-1", "track-1"),
      mappingResponse({ candidateUrl: candidate }),
    )
    await media.put(candidate, new Response("private audio"))

    for (const headers of [
      { [ACCOUNT_ID_HEADER]: "other", [DEVICE_ID_HEADER]: "device-1" },
      { [ACCOUNT_ID_HEADER]: "default", [DEVICE_ID_HEADER]: "device-reset" },
    ]) {
      await expect(
        offlineStreamResponse(new Request(streamUrl(origin, "track-1"), { headers }), map, media),
      ).resolves.toBeUndefined()
    }
  })

  test("misses cleanly when an album was never pinned", async () => {
    await expect(
      offlineStreamResponse(
        new Request("https://pyxis.test/stream/missing"),
        new MemoryCache(),
        new MemoryCache(),
      ),
    ).resolves.toBeUndefined()
  })
})
