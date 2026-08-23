export const OFFLINE_MEDIA_CACHE = "pyxis-offline-media-v1"
export const OFFLINE_STAGING_CACHE = "pyxis-offline-staging-v1"
export const OFFLINE_MAP_CACHE = "pyxis-offline-map-v1"
export const STREAM_AUTH_CACHE = "pyxis-stream-auth-v1"
export const STREAM_FENCE_CACHE = "pyxis-stream-fence-v1"
export const CANDIDATE_ID_HEADER = "x-pyxis-candidate-id"
export const ACCOUNT_ID_HEADER = "x-pyxis-account-id"
export const DEVICE_ID_HEADER = "x-pyxis-device-id"

export const OFFLINE_AUDIO_KIND = "pyxis-offline-audio-v1"
export const OFFLINE_CHUNK_BYTES = 1024 * 1024

export interface OfflineAudioManifest {
  readonly kind: typeof OFFLINE_AUDIO_KIND
  readonly chunks: number
  readonly bytes: number
  readonly contentType: string
  readonly candidateId: string
  readonly stagedAt: number
}

export interface OfflineMapping {
  readonly candidateUrl: string
  readonly cacheName?: string
}

export function streamUrl(origin: string, trackId: string): string {
  return new URL(`/stream/${encodeURIComponent(trackId)}`, origin).href
}

export function streamMappingUrl(
  origin: string,
  accountId: string,
  deviceId: string,
  trackId: string,
): string {
  const account = encodeURIComponent(accountId)
  const device = encodeURIComponent(deviceId)
  const track = encodeURIComponent(trackId)
  return new URL(`/__pyxis/offline-map/${account}/${device}/${track}`, origin).href
}

export function candidateUrl(
  origin: string,
  accountId: string,
  deviceId: string,
  candidateId: string,
): string {
  const account = encodeURIComponent(accountId)
  const device = encodeURIComponent(deviceId)
  const candidate = encodeURIComponent(candidateId)
  return new URL(`/__pyxis/offline/${account}/${device}/${candidate}`, origin).href
}

export function chunkUrl(candidate: string, index: number): string {
  return `${candidate}:chunk:${index}`
}

export function audioManifestResponse(manifest: OfflineAudioManifest): Response {
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/json", "x-pyxis-staged-at": String(manifest.stagedAt) },
  })
}

export async function readAudioManifest(
  response: Response | undefined,
): Promise<OfflineAudioManifest | undefined> {
  if (response === undefined) return undefined
  try {
    const value: unknown = await response.json()
    if (
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === OFFLINE_AUDIO_KIND &&
      "chunks" in value &&
      Number.isSafeInteger(value.chunks) &&
      Number(value.chunks) >= 0 &&
      "bytes" in value &&
      Number.isSafeInteger(value.bytes) &&
      Number(value.bytes) >= 0 &&
      "contentType" in value &&
      typeof value.contentType === "string" &&
      "candidateId" in value &&
      typeof value.candidateId === "string" &&
      "stagedAt" in value &&
      Number.isFinite(value.stagedAt)
    ) {
      return {
        kind: OFFLINE_AUDIO_KIND,
        chunks: Number(value.chunks),
        bytes: Number(value.bytes),
        contentType: value.contentType,
        candidateId: value.candidateId,
        stagedAt: Number(value.stagedAt),
      }
    }
  } catch {
    // Legacy full-body cache entries are handled by the range fallback.
  }
  return undefined
}

export function mappingResponse(mapping: OfflineMapping): Response {
  return new Response(JSON.stringify(mapping), {
    headers: { "content-type": "application/json" },
  })
}

export async function readMapping(
  response: Response | undefined,
): Promise<OfflineMapping | undefined> {
  if (response === undefined) return undefined
  try {
    const value: unknown = await response.json()
    if (
      typeof value === "object" &&
      value !== null &&
      "candidateUrl" in value &&
      typeof value.candidateUrl === "string" &&
      (!("cacheName" in value) || typeof value.cacheName === "string")
    ) {
      const cacheName = "cacheName" in value ? value.cacheName : undefined
      return {
        candidateUrl: value.candidateUrl,
        ...(typeof cacheName === "string" ? { cacheName } : {}),
      }
    }
  } catch {
    // A malformed mapping is a cache miss. The next successful pin repairs it.
  }
  return undefined
}
