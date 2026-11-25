import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import type {
  RpcLibraryAlbum,
  RpcSourceAlbumSummary,
} from "../../../../../contracts/generated/pyxis"
import type { PyxisClient } from "../../pyxis-client"
import { albums, data, id, invalid, outcome, tool } from "./tools"

// Use the metadata identity that library.album.add checks after the private source reference.
const normalize = (text: string) =>
  Array.from(text, (c) => c.toLowerCase())
    .join("")
    .replace(/[^\p{Alphabetic}\p{N}]+/gu, " ")
    .trim()
const albumKey = (album: Pick<RpcLibraryAlbum, "artist" | "title" | "year">) =>
  JSON.stringify([normalize(album.artist), normalize(album.title), album.year])
function membership(library: RpcLibraryAlbum[]) {
  const keys = new Set(library.map(albumKey)),
    artists = new Set(library.map((a) => normalize(a.artist))),
    tracks = new Set(library.flatMap((a) => a.tracks.map((t) => t.id)))
  return {
    album: (a: RpcSourceAlbumSummary) => ({ ...a, inLibrary: keys.has(albumKey(a)) }),
    artist: (name: string) => artists.has(normalize(name)),
    track: (id: string) => tracks.has(id),
  }
}
async function addSourceAlbum(
  pyxis: PyxisClient,
  pluginId: string,
  externalId: string,
  stationTrackId?: string,
) {
  const { value: album } = await pyxis.call({
    _tag: "source.album.get",
    payload: { pluginId, externalId },
  })
  if (stationTrackId && !album.tracks.some((t) => t.id === stationTrackId))
    invalid("Station track does not belong to the supplied source album.")
  const { title, artist, year, artworkUrl } = album
  return outcome(
    await pyxis.call({
      _tag: "library.album.add",
      payload: {
        title,
        artist,
        ...(year !== undefined && { year }),
        ...(artworkUrl && { artworkUrl }),
        sourceReference: { pluginId, externalId: album.externalId },
        tracks: album.tracks.map(({ id, title, artist, durationMs, trackNumber }) => ({
          id,
          title,
          artist,
          ...(durationMs !== undefined && { durationMs }),
          ...(trackNumber !== undefined && { trackNumber }),
        })),
      },
    }),
  )
}
export function registerCatalog(server: McpServer, pyxis: PyxisClient) {
  tool(
    server,
    "search.sources",
    "Search tracks, albums and artists across live sources, retaining per-source failures and library membership.",
    { query: id, limit: z.int().positive().max(100).optional() },
    "read",
    async ({ query, limit }) => {
      const result = await pyxis.call({
        _tag: "source.search.run",
        payload: { query, ...(limit && { limit }) },
      })
      if (result.status !== "ready") return outcome(result)
      const member = membership(await albums(pyxis)),
        { tracks, albums: found, artists, failures } = result.value
      return outcome({
        status: "ready",
        value: {
          tracks: tracks.map((t) => ({ ...t, inLibrary: member.track(t.id) })),
          albums: found.map(member.album),
          artists: artists.map((a) => ({ ...a, inLibrary: member.artist(a.name) })),
          failures,
        },
      })
    },
  )
  tool(
    server,
    "search.albums",
    "Search one source for albums. Library album membership matches artist, title and year.",
    { pluginId: id, query: id },
    "read",
    async (args) => {
      const result = await pyxis.call({ _tag: "source.album.search", payload: args })
      const member = membership(await albums(pyxis))
      return outcome({ status: "ready", value: result.value.map(member.album) })
    },
  )
  tool(
    server,
    "library.album.add",
    "Add a source album with its registered tracks.",
    { pluginId: id, externalId: id },
    "write",
    async ({ pluginId, externalId }) => addSourceAlbum(pyxis, pluginId, externalId),
  )
  tool(
    server,
    "stations.list",
    "List source stations and per-source failures.",
    {},
    "read",
    async () => outcome(await pyxis.call({ _tag: "source.station.list", payload: {} })),
  )
  tool(
    server,
    "stations.capture",
    "Save the album of a station track. Use its core trackId, source plugin and albumExternalId; do not guess a missing album reference.",
    { trackId: id, pluginId: id, albumExternalId: id.optional() },
    "write",
    async ({ trackId, pluginId, albumExternalId }) => {
      if (albumExternalId) return addSourceAlbum(pyxis, pluginId, albumExternalId, trackId)
      const result = await pyxis.call({
        _tag: "library.tracks.get",
        payload: { trackIds: [trackId] },
      })
      const [track] = result.value.tracks
      if (!track) return outcome({ status: "unknown" })
      return data({ status: track.albumId ? "alreadyInLibrary" : "albumReferenceRequired", track })
    },
  )
}
