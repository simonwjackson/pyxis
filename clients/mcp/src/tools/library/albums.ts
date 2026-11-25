import type { McpServer } from "@modelcontextprotocol/server"
import type { AlbumsQueryRequest } from "../../../../../contracts/generated/pyxis"
import { RpcAlbumSort } from "../../../../../contracts/generated/pyxis"
import type { PyxisClient } from "../../pyxis-client"
import { artwork } from "./artwork"
import { albumById, albums, data, expression, id, outcome, page, sort, tool } from "./tools"

export function registerAlbums(server: McpServer, pyxis: PyxisClient) {
  const query = (filters: AlbumsQueryRequest, limit?: number, cursor?: string) =>
    albumPage(pyxis, filters, limit, cursor)
  tool(
    server,
    "library.albums",
    "Page library albums. Continue with cursor and optional limit only.",
    {
      ...page,
      text: id.optional(),
      artist: id.optional(),
      tagExpression: expression.optional(),
      sort: sort.optional(),
    },
    "read",
    async ({ limit, cursor, text, artist, tagExpression, sort }) =>
      query(
        {
          ...(text && { text }),
          ...(artist && { artist }),
          ...(tagExpression && { tagExpression }),
          ...(sort && { sort }),
        },
        limit,
        cursor,
      ),
  )
  tool(
    server,
    "library.search",
    "Find library albums by artist or title. Continue with library.albums.",
    { text: id, limit: page.limit },
    "read",
    async ({ text, limit }) => query({ text }, limit),
  )
  tool(
    server,
    "library.byTag",
    "Find albums with a tag. Continue with library.albums.",
    { tag: id, limit: page.limit },
    "read",
    async ({ tag, limit }) => query({ tagExpression: { op: "tag", value: tag } }, limit),
  )
  tool(
    server,
    "library.recentlyAdded",
    "Show newest library albums first. Continue with library.albums.",
    { limit: page.limit },
    "read",
    async ({ limit }) => query({ sort: RpcAlbumSort.Added }, limit),
  )
  tool(
    server,
    "library.artist",
    "Show an artist’s library albums. Continue with library.albums.",
    { artist: id, limit: page.limit },
    "read",
    async ({ artist, limit }) => query({ artist, sort: RpcAlbumSort.Title }, limit),
  )
  tool(
    server,
    "library.album",
    "Read a library album and its tracks by core album ID.",
    { albumId: id },
    "read",
    ({ albumId }) => albumDetail(pyxis, albumId),
  )
  tool(server, "library.tags", "List tags and their album counts.", {}, "read", () =>
    tagCounts(pyxis),
  )
  tool(
    server,
    "library.artwork",
    "Fetch the stored album cover over HTTP and return MCP image content.",
    { albumId: id },
    "read",
    ({ albumId }) => albumArtwork(pyxis, albumId),
  )
}

export const albumPage = async (
  pyxis: PyxisClient,
  filters: AlbumsQueryRequest,
  limit?: number,
  cursor?: string,
) =>
  outcome(
    await pyxis.call({
      _tag: "library.albums.query",
      payload: { ...filters, ...(limit && { limit }), ...(cursor && { cursor }) },
    }),
  )

export async function albumDetail(pyxis: PyxisClient, albumId: string) {
  const value = await albumById(pyxis, albumId)
  return outcome(value ? { status: "ready", value } : { status: "unknown" })
}
export async function tagCounts(pyxis: PyxisClient) {
  const counts = new Map<string, number>()
  for (const album of await albums(pyxis))
    for (const tag of album.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return data({
    tags: Array.from(counts.keys())
      .sort()
      .map((tag) => ({ tag, count: counts.get(tag) })),
  })
}
export async function albumArtwork(pyxis: PyxisClient, albumId: string) {
  const album = await albumById(pyxis, albumId)
  if (!album) return outcome({ status: "unknown" })
  if (!album.artworkUrl) return data({ status: "noArtwork" })
  return artwork(album.artworkUrl)
}
