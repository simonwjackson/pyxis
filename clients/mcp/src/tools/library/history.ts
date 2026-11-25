import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { RpcLibraryAlbum, RpcListenEvent } from "../../../../../contracts/generated/pyxis"
import type { PyxisClient } from "../../pyxis-client"
import { albums, data, invalid, tool } from "./tools"

const cap = 1000,
  limit = z.int().min(1).max(cap).optional(),
  instant = z.iso.datetime({ offset: true })
// Compare RFC3339 instants (including sub-millisecond journal precision), not local dates.
function time(value: string) {
  const fraction = value.match(/\.(\d+)/u)?.[1] ?? ""
  return (
    BigInt(Math.floor(Date.parse(value) / 1000)) * 1000000000n +
    BigInt(fraction.slice(0, 9).padEnd(9, "0"))
  )
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
function project(library: RpcLibraryAlbum[], events: RpcListenEvent[]) {
  const membership = new Map<string, string>()
  for (const a of library)
    for (const t of a.tracks) {
      const prior = membership.get(t.id)
      if (prior === undefined || a.id < prior) membership.set(t.id, a.id)
    }
  const stats = new Map<string, { plays: number; lastPlayedAt: string }>(),
    tracks = new Map<string, number>()
  let unattributedPlays = 0
  for (const event of events) {
    tracks.set(event.trackId, (tracks.get(event.trackId) ?? 0) + 1)
    const id = event.albumId ?? membership.get(event.trackId)
    if (id === undefined) {
      unattributedPlays++
      continue
    }
    const activity = stats.get(id)
    if (activity) activity.plays++
    else stats.set(id, { plays: 1, lastPlayedAt: event.listenedAt })
  }
  return { stats, tracks, unattributedPlays }
}
export function registerHistory(server: McpServer, pyxis: PyxisClient) {
  const read = async (limit: number) =>
    (await pyxis.call({ _tag: "listen.history.list", payload: { limit } })).value
  const coverage = (events: RpcListenEvent[]) => ({
    eventsScanned: events.length,
    historyMayBeTruncated: events.length === cap,
  })
  tool(
    server,
    "history.recent",
    "Read recent track plays, newest first.",
    { limit },
    "read",
    async ({ limit }) => data({ events: await read(limit ?? 50) }),
  )
  tool(
    server,
    "history.range",
    "Read plays in [from,to), newest first, within the latest 1000 raw events.",
    { from: instant, to: instant, limit },
    "read",
    async ({ from, to, limit }) => {
      const start = time(from),
        end = time(to)
      if (start > end) invalid("from must not be after to.")
      const events = await read(cap)
      const matches = events.filter((e) => {
        const when = time(e.listenedAt)
        return when >= start && when < end
      })
      return data({
        ...coverage(events),
        events: matches.slice(0, limit ?? cap),
        matched: matches.length,
      })
    },
  )
  tool(
    server,
    "history.top",
    "Rank albums and tracks by number of plays in the latest 1000 raw events.",
    { limit },
    "read",
    async ({ limit = 20 }) => {
      const [library, events] = await Promise.all([albums(pyxis), read(cap)])
      const { stats, tracks, unattributedPlays } = project(library, events),
        byId = new Map(library.map((a) => [a.id, a]))
      return data({
        ...coverage(events),
        unattributedPlays,
        albums: [...stats]
          .sort(([a, x], [b, y]) => y.plays - x.plays || cmp(a, b))
          .slice(0, limit)
          .map(([albumId, s]) => ({
            albumId,
            ...s,
            title: byId.get(albumId)?.title,
            artist: byId.get(albumId)?.artist,
          })),
        tracks: [...tracks]
          .sort(([a, x], [b, y]) => y - x || cmp(a, b))
          .slice(0, limit)
          .map(([trackId, plays]) => ({ trackId, plays })),
      })
    },
  )
  tool(
    server,
    "history.neglected",
    "Find library albums without an observed play since before (RFC3339). No observed play is not proof an album was never played.",
    { before: instant, limit },
    "read",
    async ({ before, limit = 20 }) => {
      const [library, events] = await Promise.all([albums(pyxis), read(cap)])
      const { stats } = project(library, events),
        cutoff = time(before)
      const neglected = library
        .map(({ id: albumId, title, artist }) => ({
          albumId,
          title,
          artist,
          lastPlayedAt: stats.get(albumId)?.lastPlayedAt ?? null,
        }))
        .filter((a) => !a.lastPlayedAt || time(a.lastPlayedAt) < cutoff)
        .sort((a, b) => {
          if (a.lastPlayedAt && b.lastPlayedAt) {
            const diff = time(a.lastPlayedAt) - time(b.lastPlayedAt)
            if (diff) return diff < 0n ? -1 : 1
          } else if (a.lastPlayedAt !== b.lastPlayedAt) return a.lastPlayedAt ? 1 : -1
          return cmp(a.albumId, b.albumId)
        })
      return data({ ...coverage(events), albums: neglected.slice(0, limit) })
    },
  )
}
