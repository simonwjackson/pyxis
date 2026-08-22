export interface YtMusicAlbumSummary {
  readonly externalId: string
  readonly title: string
  readonly artist: string
  readonly year?: number
  readonly artworkUrl?: string
}

export interface YtMusicAlbumTrack {
  readonly externalId: string
  readonly title: string
  readonly artist: string
  readonly durationMs?: number
  readonly trackNumber: number
}

export interface YtMusicAlbum extends YtMusicAlbumSummary {
  readonly tracks: readonly YtMusicAlbumTrack[]
}

export interface YtMusicInternalApi {
  searchAlbums(query: string): Promise<readonly YtMusicAlbumSummary[]>
  getAlbum(externalId: string): Promise<YtMusicAlbum>
}

const CLIENT_VERSION = "1.20241023.01.00"
const ALBUM_FILTER = "EgWKAQIYAWoOEAMQBBAJEAoQERAQEBU%3D"
class YtMusicProviderError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean) {
    super(message)
    this.name = "YtMusicProviderError"
    this.code = code
    this.retryable = retryable
  }
}

const CONTEXT = {
  context: {
    client: {
      hl: "en",
      gl: "US",
      clientName: "WEB_REMIX",
      clientVersion: CLIENT_VERSION,
      platform: "DESKTOP",
    },
    user: { lockedSafetyMode: false },
    request: { useSsl: true },
  },
}

export function createYtMusicInternalApi(fetcher: typeof fetch = fetch): YtMusicInternalApi {
  const request = async (endpoint: string, body: Record<string, unknown>): Promise<unknown> => {
    let response: Response
    try {
      response = await fetcher(
        `https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0",
            "x-youtube-client-name": "67",
            "x-youtube-client-version": CLIENT_VERSION,
            origin: "https://music.youtube.com",
          },
          body: JSON.stringify({ ...CONTEXT, ...body }),
          signal: AbortSignal.timeout(30_000),
        },
      )
    } catch (error) {
      throw new YtMusicProviderError(
        "ytmusic.network",
        error instanceof Error ? error.message : "YouTube Music request failed",
        true,
      )
    }
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500
      throw new YtMusicProviderError(
        `ytmusic.http${response.status}`,
        `YouTube Music ${endpoint} returned HTTP ${response.status}`,
        retryable,
      )
    }
    try {
      return await response.json()
    } catch (error) {
      throw new YtMusicProviderError(
        "ytmusic.invalidResponse",
        error instanceof Error ? error.message : "YouTube Music returned invalid JSON",
        false,
      )
    }
  }

  return {
    async searchAlbums(query) {
      return parseAlbumSearch(
        await request("search", {
          query,
          params: ALBUM_FILTER,
        }),
      )
    },

    async getAlbum(externalId) {
      const browseId = externalId.startsWith("OLAK") ? `VL${externalId}` : externalId
      return parseAlbum(await request("browse", { browseId }), externalId)
    },
  }
}

export function parseAlbumSearch(value: unknown): readonly YtMusicAlbumSummary[] {
  const albums = new Map<string, YtMusicAlbumSummary>()
  walk(value, (record) => {
    const renderer = record.musicResponsiveListItemRenderer
    if (!isRecord(renderer)) return
    const externalId = stringAt(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"])
    if (
      externalId === undefined ||
      (!externalId.startsWith("MPRE") && !externalId.startsWith("OLAK"))
    )
      return
    const columns = arrayAt(renderer, ["flexColumns"])
    const title = runTexts(columns?.[0])[0]
    if (title === undefined) return
    const details = runs(columns?.[1])
    const artist = details.find((run) => browseId(run)?.startsWith("UC"))?.text
    if (typeof artist !== "string") return
    const yearText = details.find(
      (run) => typeof run.text === "string" && /^\d{4}$/u.test(run.text),
    )?.text
    const year = typeof yearText === "string" ? Number.parseInt(yearText, 10) : undefined
    const artworkUrl = largestThumbnail(renderer)
    albums.set(externalId, {
      externalId,
      title,
      artist,
      ...(year === undefined ? {} : { year }),
      ...(artworkUrl === undefined ? {} : { artworkUrl }),
    })
  })
  return [...albums.values()]
}

export function parseAlbum(value: unknown, requestedId: string): YtMusicAlbum {
  let title: string | undefined
  let artist: string | undefined
  let year: number | undefined
  let artworkUrl: string | undefined
  let expectedTrackCount: number | undefined

  walk(value, (record) => {
    const header = record.musicResponsiveHeaderRenderer ?? record.musicDetailHeaderRenderer
    if (!isRecord(header)) return
    title ??= firstText(header.title)
    artist ??= firstArtist(header)
    year ??= firstYear(header)
    artworkUrl ??= largestThumbnail(header)
    expectedTrackCount ??= firstTrackCount(header)
  })

  if (title === undefined || artist === undefined) {
    throw new Error(
      `YouTube Music album '${requestedId}' did not contain album metadata and tracks`,
    )
  }

  const tracks: YtMusicAlbumTrack[] = []
  const seen = new Set<string>()
  for (const renderer of albumTrackRenderers(value, expectedTrackCount)) {
    const externalId = stringAt(renderer, ["playlistItemData", "videoId"])
    if (externalId === undefined || seen.has(externalId)) continue
    const columns = arrayAt(renderer, ["flexColumns"])
    const trackTitle = runTexts(columns?.[0])[0]
    if (trackTitle === undefined) continue
    const trackArtist = runs(columns?.[1]).find((run) => browseId(run)?.startsWith("UC"))?.text
    const parsedDuration = durationMs(runTexts(arrayAt(renderer, ["fixedColumns"])?.[0])[0])
    seen.add(externalId)
    tracks.push({
      externalId,
      title: trackTitle,
      artist: typeof trackArtist === "string" ? trackArtist : artist,
      ...(parsedDuration === undefined ? {} : { durationMs: parsedDuration }),
      trackNumber: tracks.length + 1,
    })
  }

  if (tracks.length === 0) {
    throw new Error(
      `YouTube Music album '${requestedId}' did not contain album metadata and tracks`,
    )
  }
  return {
    externalId: requestedId,
    title,
    artist,
    ...(year === undefined ? {} : { year }),
    ...(artworkUrl === undefined ? {} : { artworkUrl }),
    tracks,
  }
}

function albumTrackRenderers(
  value: unknown,
  expectedTrackCount: number | undefined,
): readonly Record<string, unknown>[] {
  const shelves: Record<string, unknown>[][] = []
  walk(value, (record) => {
    const shelf = record.musicShelfRenderer ?? record.musicPlaylistShelfRenderer
    if (!isRecord(shelf)) return
    const renderers = (arrayAt(shelf, ["contents"]) ?? []).flatMap((item) =>
      isRecord(item) && isRecord(item.musicResponsiveListItemRenderer)
        ? [item.musicResponsiveListItemRenderer]
        : [],
    )
    if (renderers.length > 0) shelves.push(renderers)
  })
  if (expectedTrackCount !== undefined) {
    const exact = shelves.find((shelf) => uniqueVideoIds(shelf) === expectedTrackCount)
    if (exact !== undefined) return exact
  }
  return shelves.sort((left, right) => uniqueVideoIds(right) - uniqueVideoIds(left))[0] ?? []
}

function uniqueVideoIds(renderers: readonly Record<string, unknown>[]): number {
  return new Set(
    renderers.flatMap((renderer) => {
      const videoId = stringAt(renderer, ["playlistItemData", "videoId"])
      return videoId === undefined ? [] : [videoId]
    }),
  ).size
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (!isRecord(value)) return
  visit(value)
  for (const child of Object.values(value)) walk(child, visit)
}

function runs(value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value)) return []
  const renderer =
    value.musicResponsiveListItemFlexColumnRenderer ??
    value.musicResponsiveListItemFixedColumnRenderer
  if (!isRecord(renderer) || !isRecord(renderer.text) || !Array.isArray(renderer.text.runs))
    return []
  return renderer.text.runs.filter(isRecord)
}

function runTexts(value: unknown): readonly string[] {
  return runs(value).flatMap((run) => (typeof run.text === "string" ? [run.text] : []))
}

function firstText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.runs)) return undefined
  return value.runs.filter(isRecord).find((run) => typeof run.text === "string")?.text as
    | string
    | undefined
}

function firstArtist(header: Record<string, unknown>): string | undefined {
  let found: string | undefined
  walk(header, (record) => {
    if (found !== undefined || typeof record.text !== "string") return
    if (browseId(record)?.startsWith("UC")) found = record.text
  })
  return found
}

function firstYear(header: Record<string, unknown>): number | undefined {
  let found: number | undefined
  walk(header, (record) => {
    if (found !== undefined || typeof record.text !== "string" || !/^\d{4}$/u.test(record.text))
      return
    found = Number.parseInt(record.text, 10)
  })
  return found
}

function firstTrackCount(header: Record<string, unknown>): number | undefined {
  let found: number | undefined
  walk(header, (record) => {
    if (found !== undefined || typeof record.text !== "string") return
    const match = /^(\d+)\s+songs?$/iu.exec(record.text.trim())
    if (match?.[1] !== undefined) found = Number.parseInt(match[1], 10)
  })
  return found
}

function browseId(run: Record<string, unknown>): string | undefined {
  return stringAt(run, ["navigationEndpoint", "browseEndpoint", "browseId"])
}

function largestThumbnail(value: Record<string, unknown>): string | undefined {
  let largest: { url: string; width: number } | undefined
  walk(value, (record) => {
    if (typeof record.url !== "string" || typeof record.width !== "number") return
    if (largest === undefined || record.width > largest.width)
      largest = { url: record.url, width: record.width }
  })
  return largest?.url
}

function durationMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parts = value.split(":").map(Number)
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    parts.slice(1).some((part) => part >= 60)
  )
    return undefined
  return parts.reduce((seconds, part) => seconds * 60 + part, 0) * 1000
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return typeof current === "string" ? current : undefined
}

function arrayAt(value: unknown, path: readonly string[]): readonly unknown[] | undefined {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return Array.isArray(current) ? current : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
