import { catalogReads } from "./catalog-reads"
import { readLyrics } from "./lyrics"
import { boundedPage, type Page, position } from "./paging"
import type { ReleaseType } from "./release-type"
import {
  ALBUM_PAGE_TYPE,
  arrayAt,
  browseContinuation,
  browseId,
  canonicalAlbumId,
  continuationToken,
  decodeMix,
  encodeMix,
  isRecord,
  pageType,
  parseAlbum,
  parseAlbumSearch,
  parseArtistSearch,
  parsePlaylists,
  parseSongSearch,
  parseWatchQueue,
  stringAt,
  walk,
} from "./renderers"
import { createTransport, YtMusicProviderError } from "./transport"
export interface YtMusicAlbumSummary {
  readonly releaseType?: ReleaseType
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

export interface Playlist {
  externalId: string
  title: string
  owner?: string
  trackCount?: number
  artworkUrl?: string
}
export interface YtMusicInternalApi extends ReturnType<typeof catalogReads> {
  lyrics(id: string): ReturnType<typeof readLyrics>
  searchPlaylists(
    query: string,
    limit: number,
    exact?: boolean,
    cursor?: string,
  ): Promise<Page<Playlist>>
  suggest(query: string, limit: number, cursor?: string): Promise<Page<string>>
  searchSongs(query: string, limit: number, exact?: boolean): Promise<readonly YtMusicSong[]>
  searchAlbums(
    query: string,
    limit?: number,
    exact?: boolean,
  ): Promise<readonly YtMusicAlbumSummary[]>
  searchArtists(
    query: string,
    limit: number,
    exact?: boolean,
  ): Promise<readonly YtMusicArtistSummary[]>
  getAlbum(externalId: string): Promise<YtMusicAlbum>
  mixStation(kind: "album" | "artist" | "playlist", id: string, shuffle: boolean): Promise<string>
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

/// Opaque WEB_REMIX search filters. Each restricts `/search` to one catalog result type,
/// which is why a song query never returns ordinary uploads.
const SONG_FILTER = "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"
const ALBUM_FILTER = "EgWKAQIYAWoOEAMQBBAJEAoQERAQEBU%3D"
const ARTIST_FILTER = "EgWKAQIgAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"
export function createYtMusicInternalApi(fetcher: typeof fetch = fetch): YtMusicInternalApi {
  const request = createTransport(fetcher)
  return {
    ...catalogReads(request),
    lyrics: (id) => readLyrics(request, id),
    async searchPlaylists(query, limit, exact, cursor) {
      const pos = position(cursor)
      const data = await request(
        "search",
        pos.token
          ? { continuation: pos.token }
          : {
              query,
              params: exact
                ? "Eg-KAQwIABAAGAAgACgBMABCAggBagoQBBADEAkQBRAK"
                : "EgeKAQQoAEABahAQAxAEEAkQChAFEBEQEBAV",
            },
        false,
        pos.token,
      )
      return boundedPage(parsePlaylists(data), pos, limit, continuationToken(data))
    },
    async suggest(query, limit, cursor) {
      const data = await request("music/get_search_suggestions", { input: query })
      const items: string[] = []
      walk(data, (node) => {
        const text = stringAt(node.searchSuggestionRenderer, [
          "navigationEndpoint",
          "searchEndpoint",
          "query",
        ])
        if (text) items.push(text)
      })
      return boundedPage(items, position(cursor), limit)
    },
    async searchSongs(query, limit, exact) {
      return parseSongSearch(
        await request("search", {
          query,
          params: exact ? "EgWKAQIIAUICCAFqDBAOEAoQAxAEEAkQBQ%3D%3D" : SONG_FILTER,
        }),
        limit,
      )
    },

    async searchAlbums(query, limit = 10, exact) {
      const albums = parseAlbumSearch(
        await request("search", {
          query,
          params: exact ? "EgWKAQIYAUICCAFqDBAOEAoQAxAEEAkQBQ%3D%3D" : ALBUM_FILTER,
        }),
      )
      return Promise.all(
        albums.slice(0, limit).map(async (album) => ({
          ...album,
          externalId: album.externalId.startsWith("OLAK")
            ? album.externalId
            : canonicalAlbumId(
                await request("browse", { browseId: album.externalId }),
                album.externalId,
              ),
        })),
      )
    },

    async searchArtists(query, limit, exact) {
      return parseArtistSearch(
        await request("search", {
          query,
          params: exact ? "EgWKAQIgAUICCAFqDBAOEAoQAxAEEAkQBQ%3D%3D" : ARTIST_FILTER,
        }),
        limit,
      )
    },

    async getAlbum(externalId) {
      const requestedBrowseId = externalId.startsWith("OLAK") ? `VL${externalId}` : externalId
      let page = await request("browse", { browseId: requestedBrowseId })
      if (externalId.startsWith("OLAK")) {
        let albumId: string | undefined
        walk(page, (record) => {
          if (pageType(record) === ALBUM_PAGE_TYPE) albumId ??= browseId(record)
        })
        if (albumId?.startsWith("MPRE")) page = await request("browse", { browseId: albumId })
      }
      // album.get is atomic. Materialize the track shelf, not recommendation carousels.
      let items: unknown[] | undefined
      walk(page, (record) => {
        const shelf = record.musicPlaylistShelfRenderer ?? record.musicShelfRenderer
        if (
          isRecord(shelf) &&
          Array.isArray(shelf.contents) &&
          shelf.contents.some(
            (x) =>
              isRecord(x) &&
              stringAt(x, ["musicResponsiveListItemRenderer", "playlistItemData", "videoId"]),
          )
        )
          items ??= shelf.contents
      })
      if (items) {
        const seen = new Set<string>()
        for (let token = browseContinuation(items); token; token = browseContinuation(items)) {
          if (seen.has(token) || items.length > 1001) throw new Error("invalid album continuation")
          seen.add(token)
          const next = await request("browse", { continuation: token })
          const action = arrayAt(next, ["onResponseReceivedActions"])?.[0]
          const more = arrayAt(action, ["appendContinuationItemsAction", "continuationItems"])
          if (!more) throw new Error("missing album continuation items")
          items.splice(-1, 1, ...more)
        }
      }
      return parseAlbum(page, externalId)
    },

    async mixStation(kind, id, shuffle) {
      let playlistId = id
      const params = shuffle ? "wAEB8gECKAE%3D" : "wAEB"
      if (kind === "artist") {
        const artist = await request("browse", { browseId: id })
        let found: string | undefined
        walk(isRecord(artist) ? artist.header : undefined, (node) => {
          const button = node[shuffle ? "playButton" : "startRadioButton"]
          walk(button, (r) => {
            found ??=
              stringAt(r, ["watchPlaylistEndpoint", "playlistId"]) ??
              stringAt(r, ["watchEndpoint", "playlistId"])
          })
        })
        if (!found)
          throw new YtMusicProviderError(
            "ytmusic.noArtistMix",
            "Artist does not offer this mix",
            false,
          )
        playlistId = found
      } else {
        if (kind === "album" && !id.startsWith("OLAK"))
          playlistId = canonicalAlbumId(await request("browse", { browseId: id }), id)
        if (kind === "album" && !playlistId.startsWith("OLAK"))
          throw new YtMusicProviderError("ytmusic.noAlbumMix", "No album playlist", false)
        if (!shuffle && kind === "playlist") playlistId = `RDAMPL${playlistId}`
      }
      return encodeMix({ playlistId, params })
    },
    async watchQueue(seedVideoId, continuation, limit) {
      const initial = {
        playlistId: radioPlaylistId(seedVideoId),
        videoId: seedVideoId,
        params: "wAEB",
      }
      const resumed = decodeMix(continuation)
      const mix = resumed ?? decodeMix(seedVideoId) ?? initial
      const body = {
        playlistId: mix.playlistId,
        videoId: mix.videoId,
        params: mix.params,
        isAudioOnly: true,
        enablePersistentPlaylistPanel: true,
        tunerSettingValue: "AUTOMIX_SETTING_NORMAL",
      }
      const queue = parseWatchQueue(
        await request("next", body, false, resumed ? resumed.token : continuation),
        limit,
      )
      if (resumed && queue.continuation && !decodeMix(queue.continuation))
        return { ...queue, continuation: encodeMix({ ...mix, token: queue.continuation }) }
      return queue
    },
  }
}
