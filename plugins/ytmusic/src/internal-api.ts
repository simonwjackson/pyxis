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

export interface YtMusicSong {
  readonly externalId: string
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly albumExternalId?: string
  readonly durationMs?: number
  readonly artworkUrl?: string
}

export interface YtMusicArtistSummary {
  readonly externalId: string
  readonly name: string
  readonly artworkUrl?: string
}

/// One page of a YouTube Music radio queue.
///
/// `continuation` absent means the queue offered no further page. That is different from an
/// unreadable response, which throws instead, so an upstream layout change can never be
/// mistaken for a station that ran out.
export interface YtMusicWatchQueue {
  readonly tracks: readonly YtMusicSong[]
  readonly continuation?: string
}

export interface YtMusicInternalApi {
  searchSongs(query: string, limit: number): Promise<readonly YtMusicSong[]>
  searchAlbums(query: string): Promise<readonly YtMusicAlbumSummary[]>
  searchArtists(query: string, limit: number): Promise<readonly YtMusicArtistSummary[]>
  getAlbum(externalId: string): Promise<YtMusicAlbum>
  watchQueue(
    seedVideoId: string,
    continuation: string | undefined,
    limit: number,
  ): Promise<YtMusicWatchQueue>
}

/// A YouTube Music radio playlist derived from one recording. Deriving it is a local string
/// operation, so starting a station makes no upstream write and needs no account.
export function radioPlaylistId(seedVideoId: string): string {
  return `RDAMVM${seedVideoId}`
}

const CLIENT_VERSION = "1.20241023.01.00"
/// Opaque WEB_REMIX search filters. Each restricts `/search` to one catalog result type,
/// which is why a song query never returns ordinary uploads.
const SONG_FILTER = "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"
const ALBUM_FILTER = "EgWKAQIYAWoOEAMQBBAJEAoQERAQEBU%3D"
const ARTIST_FILTER = "EgWKAQIgAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"
/// Only this recording type is a catalog song. Ordinary music videos and user uploads
/// carry other types and are deliberately excluded from search results.
const SONG_VIDEO_TYPE = "MUSIC_VIDEO_TYPE_ATV"
const ARTIST_PAGE_TYPE = "MUSIC_PAGE_TYPE_ARTIST"
const ALBUM_PAGE_TYPE = "MUSIC_PAGE_TYPE_ALBUM"
const ARTIST_REFERENCE = /^UC[A-Za-z0-9_-]{22}$/u
/// The core carries durations in a u32 millisecond field, so a larger value cannot be
/// reported. Omitting it keeps otherwise valid metadata usable.
const MAX_DURATION_MS = 4_294_967_295
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
    async searchSongs(query, limit) {
      return parseSongSearch(await request("search", { query, params: SONG_FILTER }), limit)
    },

    async searchAlbums(query) {
      return parseAlbumSearch(
        await request("search", {
          query,
          params: ALBUM_FILTER,
        }),
      )
    },

    async searchArtists(query, limit) {
      return parseArtistSearch(await request("search", { query, params: ARTIST_FILTER }), limit)
    },

    async getAlbum(externalId) {
      const browseId = externalId.startsWith("OLAK") ? `VL${externalId}` : externalId
      return parseAlbum(await request("browse", { browseId }), externalId)
    },

    async watchQueue(seedVideoId, continuation, limit) {
      const body =
        continuation === undefined
          ? {
              videoId: seedVideoId,
              playlistId: radioPlaylistId(seedVideoId),
              isAudioOnly: true,
            }
          : { continuation }
      return parseWatchQueue(await request("next", body), limit)
    },
  }
}

/// Reads one page of a radio queue.
///
/// The panel is located first and its absence is a typed failure. The recovered Raziel parser
/// returned an empty array for an unknown layout, which would make a broken parse look exactly
/// like an exhausted station and hide the breakage behind "radio just stopped".
export function parseWatchQueue(value: unknown, limit: number): YtMusicWatchQueue {
  // A first page wraps its queue in `playlistPanelRenderer`. A continuation returns
  // `playlistPanelContinuation` at the top level instead, with the same contents inside.
  // Accepting only the first shape made every continued batch fail, which is how the live
  // check found this.
  let panel: Record<string, unknown> | undefined
  walk(value, (record) => {
    if (panel !== undefined) return
    for (const key of ["playlistPanelRenderer", "playlistPanelContinuation"]) {
      const candidate = record[key]
      if (isRecord(candidate)) {
        panel = candidate
        return
      }
    }
  })
  if (panel === undefined) {
    throw new YtMusicProviderError(
      "ytmusic.unknownLayout",
      "YouTube Music watch response contained no playlist panel",
      false,
    )
  }

  const songs = new Map<string, YtMusicSong>()
  walk(panel, (record) => {
    const renderer = record.playlistPanelVideoRenderer
    if (!isRecord(renderer)) return
    // D18 keeps general uploads out of anything that reaches the queue, and a radio page can
    // carry them. Only a catalog recording is accepted. The cost is a smaller batch when a
    // station leans on official music videos; a visibly short batch is better than widening
    // what enters the library path.
    if (musicVideoType(renderer) !== SONG_VIDEO_TYPE) return
    const externalId = videoId(renderer)
    if (externalId === undefined || songs.has(externalId)) return
    const title = plainRunTexts(renderer.title)[0]
    if (title === undefined) return
    const details = plainRuns(renderer.longBylineText)
    const album = details.find((run) => pageType(run) === ALBUM_PAGE_TYPE)
    const albumTitle = typeof album?.text === "string" ? album.text : undefined
    const artist = songArtist(details, albumTitle)
    if (artist === undefined) return
    const albumExternalId = album === undefined ? undefined : browseId(album)
    const duration = durationMs(plainRunTexts(renderer.lengthText)[0])
    const artworkUrl = largestThumbnail(renderer)
    songs.set(externalId, {
      externalId,
      title,
      artist,
      ...(albumTitle === undefined ? {} : { album: albumTitle }),
      ...(albumExternalId === undefined ? {} : { albumExternalId }),
      ...(duration === undefined ? {} : { durationMs: duration }),
      ...(artworkUrl === undefined ? {} : { artworkUrl }),
    })
  })

  const continuation = watchContinuation(panel)
  return {
    tracks: [...songs.values()].slice(0, limit),
    ...(continuation === undefined ? {} : { continuation }),
  }
}

/// A radio page advertises its next page under one of two continuation shapes.
function watchContinuation(panel: Record<string, unknown>): string | undefined {
  let found: string | undefined
  walk(panel, (record) => {
    if (found !== undefined) return
    for (const key of ["nextRadioContinuationData", "nextContinuationData"]) {
      const data = record[key]
      if (!isRecord(data)) continue
      const continuation = data.continuation
      if (typeof continuation === "string" && continuation.length > 0) {
        found = continuation
        return
      }
    }
  })
  return found
}

/// A watch-queue renderer holds its runs directly, unlike a search result, which wraps them in
/// a flex-column renderer first.
function plainRuns(value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value.runs)) return []
  return value.runs.filter(isRecord)
}

function plainRunTexts(value: unknown): readonly string[] {
  return plainRuns(value).flatMap((run) => (typeof run.text === "string" ? [run.text] : []))
}

export function parseSongSearch(value: unknown, limit: number): readonly YtMusicSong[] {
  const songs = new Map<string, YtMusicSong>()
  walk(value, (record) => {
    const renderer = record.musicResponsiveListItemRenderer
    if (!isRecord(renderer)) return
    const columns = arrayAt(renderer, ["flexColumns"])
    const title = runs(columns?.[0]).find(
      (run) => musicVideoType(run) === SONG_VIDEO_TYPE && videoId(run) !== undefined,
    )
    if (title === undefined || typeof title.text !== "string") return
    const externalId = videoId(title)
    if (externalId === undefined || songs.has(externalId)) return
    const details = runs(columns?.[1])
    const album = details.find((run) => pageType(run) === ALBUM_PAGE_TYPE)
    const albumTitle = typeof album?.text === "string" ? album.text : undefined
    const artist = songArtist(details, albumTitle)
    if (artist === undefined) return
    const albumExternalId = album === undefined ? undefined : browseId(album)
    const duration = details.flatMap((run) => {
      const parsed = typeof run.text === "string" ? durationMs(run.text) : undefined
      return parsed === undefined ? [] : [parsed]
    })[0]
    const artworkUrl = largestThumbnail(renderer)
    songs.set(externalId, {
      externalId,
      title: title.text,
      artist,
      ...(albumTitle === undefined ? {} : { album: albumTitle }),
      ...(albumExternalId === undefined ? {} : { albumExternalId }),
      ...(duration === undefined ? {} : { durationMs: duration }),
      ...(artworkUrl === undefined ? {} : { artworkUrl }),
    })
  })
  return [...songs.values()].slice(0, limit)
}

export function parseArtistSearch(value: unknown, limit: number): readonly YtMusicArtistSummary[] {
  const artists = new Map<string, YtMusicArtistSummary>()
  walk(value, (record) => {
    const renderer = record.musicResponsiveListItemRenderer
    if (!isRecord(renderer)) return
    const externalId = stringAt(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"])
    if (externalId === undefined || !ARTIST_REFERENCE.test(externalId) || artists.has(externalId))
      return
    const name = runTexts(arrayAt(renderer, ["flexColumns"])?.[0])[0]
    if (name === undefined) return
    const artworkUrl = largestThumbnail(renderer)
    artists.set(externalId, {
      externalId,
      name,
      ...(artworkUrl === undefined ? {} : { artworkUrl }),
    })
  })
  return [...artists.values()].slice(0, limit)
}

/// A catalog song usually links its artist to a channel page. When it does not, the
/// leading detail run still names the artist, so the entry is kept rather than dropped.
/// Separators, the album title and the duration are never the artist.
function songArtist(
  details: readonly Record<string, unknown>[],
  albumTitle: string | undefined,
): string | undefined {
  const linked = details.find((run) => pageType(run) === ARTIST_PAGE_TYPE)?.text
  if (typeof linked === "string" && linked.length > 0) return linked
  for (const run of details) {
    if (typeof run.text !== "string") continue
    const text = run.text.trim()
    if (text.length === 0 || text === "\u2022") continue
    if (text === albumTitle || durationMs(text) !== undefined) continue
    return text
  }
  return undefined
}

function pageType(run: Record<string, unknown>): string | undefined {
  return stringAt(run, [
    "navigationEndpoint",
    "browseEndpoint",
    "browseEndpointContextSupportedConfigs",
    "browseEndpointContextMusicConfig",
    "pageType",
  ])
}

function musicVideoType(run: Record<string, unknown>): string | undefined {
  return stringAt(run, [
    "navigationEndpoint",
    "watchEndpoint",
    "watchEndpointMusicSupportedConfigs",
    "watchEndpointMusicConfig",
    "musicVideoType",
  ])
}

function videoId(run: Record<string, unknown>): string | undefined {
  return stringAt(run, ["navigationEndpoint", "watchEndpoint", "videoId"])
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

/// The release year is looked for everywhere in the header except the title, because an
/// album whose title is four digits (Clown Core, "1234") would otherwise report its own
/// title as its release year. The range check is a second guard for the same class of
/// mistake elsewhere in the header.
function firstYear(header: Record<string, unknown>): number | undefined {
  const { title: _title, ...rest } = header
  const latest = new Date().getUTCFullYear() + 1
  let found: number | undefined
  walk(rest, (record) => {
    if (found !== undefined || typeof record.text !== "string" || !/^\d{4}$/u.test(record.text))
      return
    const year = Number.parseInt(record.text, 10)
    if (year < 1900 || year > latest) return
    found = year
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

/// Every component must be digits only, because `Number` reads an empty component as zero
/// and would turn ':' into a real duration. The result must also fit the core's u32
/// millisecond field, so an implausible hour count is omitted instead of overflowing it.
function durationMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const components = value.split(":")
  if (components.length < 2 || components.length > 3) return undefined
  if (!components.every((component) => /^\d+$/u.test(component))) return undefined
  const parts = components.map(Number)
  if (parts.slice(1).some((part) => part >= 60)) return undefined
  const milliseconds = parts.reduce((seconds, part) => seconds * 60 + part, 0) * 1000
  return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_DURATION_MS
    ? milliseconds
    : undefined
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
