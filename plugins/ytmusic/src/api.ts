export interface SourceTrack {
  readonly source: "ytmusic"
  readonly externalId: string
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly durationMs?: number
  readonly artworkUrl?: string
}

export interface SearchInput {
  readonly query: string
  readonly limit?: number
}

export interface SearchOutput {
  readonly tracks: readonly SourceTrack[]
}

export interface StreamResolveInput {
  readonly trackId: string
}

export interface RemoteStream {
  readonly kind: "remote"
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly format?: string
  readonly bitrateKbps?: number
  readonly sampleRateHz?: number
  readonly lossless: boolean
}

export function searchInput(value: unknown): SearchInput {
  if (!isRecord(value) || typeof value.query !== "string" || value.query.trim().length === 0) {
    throw new Error("search input requires a non-empty query")
  }
  const limit = value.limit === undefined ? 10 : value.limit
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 50) {
    throw new Error("search limit must be an integer from 1 to 50")
  }
  return { query: value.query.trim(), limit: limit as number }
}

export function streamResolveInput(value: unknown): StreamResolveInput {
  if (!isRecord(value) || typeof value.trackId !== "string" || value.trackId.length === 0) {
    throw new Error("stream.resolve input requires trackId")
  }
  return { trackId: value.trackId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
