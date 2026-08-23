import type { OfflineCache } from "../worker/downloads"
import {
  ACCOUNT_ID_HEADER,
  chunkUrl,
  DEVICE_ID_HEADER,
  OFFLINE_CHUNK_BYTES,
  OFFLINE_STAGING_CACHE,
  readAudioManifest,
  readMapping,
  streamMappingUrl,
} from "../worker/offline-cache"
import { parseRangeHeader, rangeResponse } from "../worker/range"

export async function offlineStreamResponse(
  request: Request,
  mapCache: OfflineCache,
  mediaCache: OfflineCache,
  stagingCache?: OfflineCache,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith("/stream/")) return undefined
  const trackId = decodeURIComponent(url.pathname.slice("/stream/".length))
  const accountId = request.headers.get(ACCOUNT_ID_HEADER) ?? url.searchParams.get("pyxisAccount")
  const deviceId = request.headers.get(DEVICE_ID_HEADER) ?? url.searchParams.get("pyxisDevice")
  if (accountId === null || deviceId === null) return undefined
  const leasedCandidate = url.searchParams.get("pyxisCandidate")
  const leasedCache = url.searchParams.get("pyxisCache")
  const candidatePrefix = new URL(
    `/__pyxis/offline/${encodeURIComponent(accountId)}/${encodeURIComponent(deviceId)}/`,
    url.origin,
  ).href
  const mapping =
    leasedCandidate?.startsWith(candidatePrefix) &&
    (leasedCache === OFFLINE_STAGING_CACHE || leasedCache === null)
      ? {
          candidateUrl: leasedCandidate,
          ...(leasedCache === null ? {} : { cacheName: leasedCache }),
        }
      : await readMapping(
          await mapCache.match(streamMappingUrl(url.origin, accountId, deviceId, trackId)),
        )
  if (mapping === undefined) return undefined
  const selected =
    mapping.cacheName === OFFLINE_STAGING_CACHE && stagingCache !== undefined
      ? stagingCache
      : mediaCache
  const cached = await selected.match(mapping.candidateUrl)
  if (cached === undefined) return undefined
  const manifest = await readAudioManifest(cached.clone())
  if (manifest === undefined) return rangeResponse(cached, request)

  const range = parseRangeHeader(request.headers.get("range"), manifest.bytes)
  const common = {
    "content-type": manifest.contentType,
    "accept-ranges": "bytes",
    "x-pyxis-candidate-id": manifest.candidateId,
  }
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "content-range": `bytes */${manifest.bytes}` },
    })
  }
  const start = range?.start ?? 0
  const end = range?.end ?? manifest.bytes - 1
  const length = end - start + 1
  const body = candidateStream(selected, mapping.candidateUrl, start, end)
  return new Response(body, {
    status: range === undefined ? 200 : 206,
    headers: {
      ...common,
      "content-length": String(length),
      ...(range === undefined
        ? {}
        : { "content-range": `bytes ${start}-${end}/${manifest.bytes}` }),
    },
  })
}

function candidateStream(
  cache: OfflineCache,
  candidate: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  let index = Math.floor(start / OFFLINE_CHUNK_BYTES)
  const lastChunk = Math.floor(end / OFFLINE_CHUNK_BYTES)
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index > lastChunk) {
        controller.close()
        return
      }
      try {
        const response = await cache.match(chunkUrl(candidate, index))
        if (response === undefined) throw new Error(`offline chunk ${index} is missing`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const chunkStart = index * OFFLINE_CHUNK_BYTES
        const from = Math.max(0, start - chunkStart)
        const to = Math.min(bytes.length, end - chunkStart + 1)
        index += 1
        controller.enqueue(bytes.slice(from, to))
        if (index > lastChunk) controller.close()
      } catch (cause) {
        controller.error(cause)
      }
    },
  })
}
