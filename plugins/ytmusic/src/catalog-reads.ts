import type { YtMusicAlbumSummary, YtMusicSong } from "./internal-api"
import { boundedPage, position } from "./paging"
import {
  arrayAt,
  browseId,
  canonicalAlbumId,
  continuationToken,
  firstText,
  isRecord,
  largestThumbnail,
  musicVideoType,
  parseQueueItems,
  parseSongSearch,
  plainRuns,
  plainRunTexts,
  playlistSongs,
  stringAt,
  videoId,
  walk,
} from "./renderers"
import type { createTransport } from "./transport"

type Request = ReturnType<typeof createTransport>

import { releaseType } from "./release-type"
export function tabId(next: unknown, prefix: string) {
  let id: string | undefined
  walk(next, (n) => {
    const tab = n.tabRenderer
    if (!isRecord(tab) || tab.unselectable === true) return
    const ref = stringAt(tab, ["endpoint", "browseEndpoint", "browseId"])
    if (ref?.startsWith(prefix) || (prefix === "MPTR" && ref === "FEmusic_related")) id ??= ref
  })
  return id
}
function sections(data: unknown) {
  const shelves: {
    name: string
    body: Record<string, unknown>
    endpoint?: Record<string, unknown>
  }[] = []
  walk(data, (n) => {
    const shelf = n.musicCarouselShelfRenderer
    if (!isRecord(shelf) || !isRecord(shelf.header)) return
    const header = shelf.header.musicCarouselShelfBasicHeaderRenderer
    if (!isRecord(header)) return
    const name = firstText(header.title)
    if (name !== "Albums" && name !== "Singles" && name !== "Singles & EPs") return
    let endpoint: Record<string, unknown> | undefined
    walk(header, (r) => {
      if (isRecord(r.browseEndpoint) && typeof r.browseEndpoint.browseId === "string")
        endpoint ??= r.browseEndpoint
    })
    shelves.push({ name, body: shelf, ...(endpoint && { endpoint }) })
  })
  return shelves
}
function releases(data: unknown, artist: string, section: string) {
  const rows: YtMusicAlbumSummary[] = []
  walk(data, (n) => {
    const r = n.musicTwoRowItemRenderer
    if (!isRecord(r)) return
    const browse = browseId(r)
    const title = firstText(r.title)
    if (!browse?.startsWith("MPRE") || !title) return
    let id: string | undefined
    walk(r, (v) => {
      if (typeof v.playlistId === "string" && v.playlistId.startsWith("OLAK5uy_"))
        id ??= v.playlistId
    })
    const texts = plainRunTexts(r.subtitle)
    const year = texts.find((t) => /^\d{4}$/.test(t))
    const artworkUrl = largestThumbnail(r)
    rows.push({
      title,
      externalId: id ?? browse,
      artist,
      releaseType: releaseType(texts) ?? (section === "Albums" ? "album" : "single"),
      ...(year && { year: Number(year) }),
      ...(artworkUrl && { artworkUrl }),
    })
  })
  return rows
}
type DiscographyContinuation =
  | { kind: "grid"; endpoint: Record<string, unknown>; token: string }
  | { kind: "body"; token: string }
function discographyContinuation(data: unknown, endpoint: Record<string, unknown> | undefined) {
  let gridToken: string | undefined
  walk(data, (n) => {
    const grid = n.gridRenderer ?? n.gridContinuation
    const c = arrayAt(grid, ["continuations"])?.[0]
    gridToken ??= stringAt(c, ["nextContinuationData", "continuation"])
  })
  if (gridToken && endpoint)
    return JSON.stringify({
      kind: "grid",
      endpoint,
      token: gridToken,
    } satisfies DiscographyContinuation)
  const token = continuationToken(data)
  return token && JSON.stringify({ kind: "body", token } satisfies DiscographyContinuation)
}
export function catalogReads(request: Request) {
  return {
    async discography(id: string, limit: number, cursor?: string) {
      const { section = 0, page } = cursor ? JSON.parse(cursor) : {}
      const pos = position(page)
      const artistPage = await request("browse", { browseId: id }),
        shelves = sections(artistPage),
        shelf = shelves[section]
      if (!shelf) return { items: [] }
      let name: string | undefined
      walk(artistPage, (r) => {
        const h =
          r.musicImmersiveHeaderRenderer ??
          r.musicVisualHeaderRenderer ??
          r.musicResponsiveHeaderRenderer
        if (isRecord(h)) name ??= firstText(h.title)
      })
      if (!name) throw new Error("Artist page has no artist name")
      const resume: DiscographyContinuation | undefined = pos.token && JSON.parse(pos.token)
      const endpoint =
        resume?.kind === "grid"
          ? resume.endpoint
          : shelf.endpoint && { browseId: shelf.endpoint.browseId, params: shelf.endpoint.params }
      const data =
        resume?.kind === "body"
          ? await request("browse", { continuation: resume.token })
          : endpoint
            ? await request("browse", endpoint, false, resume?.token)
            : shelf.body
      const result = boundedPage(
        releases(data, name, shelf.name),
        pos,
        limit,
        discographyContinuation(data, endpoint),
      )
      const items = await Promise.all(
        result.items.map(async (row) =>
          row.externalId.startsWith("MPRE")
            ? {
                ...row,
                externalId: canonicalAlbumId(
                  await request("browse", { browseId: row.externalId }),
                  row.externalId,
                ),
              }
            : row,
        ),
      )
      const after = result.cursor
        ? { section, page: result.cursor }
        : shelves[section + 1]
          ? { section: section + 1 }
          : undefined
      return { items, ...(after && { cursor: JSON.stringify(after) }) }
    },
    async playlistTracks(id: string, limit: number, cursor?: string) {
      const pos = position(cursor)
      const page = await request(
        "browse",
        pos.token ? { continuation: pos.token } : { browseId: `VL${id}` },
      )
      let items: readonly unknown[] | undefined
      walk(page, (n) => {
        items ??= pos.token
          ? arrayAt(n.appendContinuationItemsAction, ["continuationItems"])
          : arrayAt(n.musicPlaylistShelfRenderer, ["contents"])
      })
      if (!items) throw new Error("Playlist page contains no track shelf")
      return boundedPage(playlistSongs(items), pos, limit, continuationToken(items))
    },
    async related(id: string, limit: number, cursor?: string) {
      const pos = position(cursor)
      const related = pos.token ? undefined : tabId(await request("next", { videoId: id }), "MPTR")
      if (!pos.token && !related) return { items: [] }
      const data = await request(
        "browse",
        pos.token ? { continuation: pos.token } : { browseId: related },
      )
      const rows = new Map<string, YtMusicSong>(
        parseSongSearch(data, Infinity).map((row) => [row.externalId, row]),
      )
      walk(data, (n) => {
        const r = n.musicTwoRowItemRenderer
        if (!isRecord(r) || musicVideoType(r) !== "MUSIC_VIDEO_TYPE_ATV") return
        const externalId = videoId(r),
          title = firstText(r.title),
          artist = plainRuns(r.subtitle).find((run) => browseId(run)?.startsWith("UC"))?.text
        if (externalId && title && typeof artist === "string")
          rows.set(externalId, { externalId, title, artist })
      })
      return boundedPage([...rows.values()], pos, limit, continuationToken(data))
    },
    async details(ids: readonly string[]) {
      const data = await request("music/get_queue", { videoIds: ids })
      const queue = arrayAt(data, ["queueDatas"])
      if (!queue) throw new Error("Song details response has no queue data")
      const songs = parseQueueItems(queue.flatMap((row) => (isRecord(row) ? [row.content] : [])))
      const byId = new Map(songs.map((song) => [song.externalId, song]))
      return ids.flatMap((id) => byId.get(id) ?? [])
    },
    async credits(id: string) {
      const data = await request("music/get_queue", { videoIds: [id] })
      let ref: string | undefined
      walk(data, (n) => {
        const b = stringAt(n, ["browseEndpoint", "browseId"])
        if (b?.startsWith("MPTC")) ref ??= b
      })
      if (!ref) return []
      const rows: { role: string; names: string[] }[] = []
      walk(await request("browse", { browseId: ref }), (n) => {
        const section = n.dismissableDialogContentSectionRenderer
        if (!isRecord(section)) return
        const role = firstText(section.title),
          names = plainRunTexts(section.subtitle).filter((_, i) => i % 2 === 0)
        if (role && names.length) rows.push({ role, names })
      })
      return rows
    },
  }
}
