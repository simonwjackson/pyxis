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
    const response = await fetcher(
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
    if (!response.ok) throw new Error(`YouTube Music ${endpoint} returned HTTP ${response.status}`)
    return response.json()
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
  const tracks: YtMusicAlbumTrack[] = []

  walk(value, (record) => {
    const header = record.musicResponsiveHeaderRenderer
    if (isRecord(header)) {
      title ??= firstText(header.title)
      artist ??= firstArtist(header)
      year ??= firstYear(header)
      artworkUrl ??= largestThumbnail(header)
    }

    const renderer = record.musicResponsiveListItemRenderer
    if (!isRecord(renderer)) return
    const externalId = stringAt(renderer, ["playlistItemData", "videoId"])
    if (externalId === undefined) return
    const columns = arrayAt(renderer, ["flexColumns"])
    const trackTitle = runTexts(columns?.[0])[0]
    if (trackTitle === undefined) return
    const trackArtist = runs(columns?.[1]).find((run) => browseId(run)?.startsWith("UC"))?.text
    const durationText = runTexts(arrayAt(renderer, ["fixedColumns"])?.[0])[0]
    tracks.push({
      externalId,
      title: trackTitle,
      artist: typeof trackArtist === "string" ? trackArtist : (artist ?? "Unknown"),
      ...(durationText === undefined ? {} : { durationMs: durationMs(durationText) }),
      trackNumber: tracks.length + 1,
    })
  })

  if (title === undefined && tracks[0] !== undefined) title = "Unknown Album"
  if (artist === undefined && tracks[0] !== undefined) artist = tracks[0].artist
  if (title === undefined || artist === undefined || tracks.length === 0) {
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

function durationMs(value: string): number {
  const parts = value.split(":").map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
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
