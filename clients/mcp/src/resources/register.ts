import {
  type CallToolResult,
  type McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
} from "@modelcontextprotocol/server"
import type { PyxisClient } from "../pyxis-client"
import { rooms, sessions } from "../targets"
import { albumArtwork, albumDetail, albumPage, tagCounts } from "../tools/library/albums"
import { history } from "../tools/library/history"
import { albums, data } from "../tools/library/tools"

export const nowPlaying = "pyxis://now-playing"
const json = "application/json"
const hint = (ttlMs: number) => ({ ttlMs, cacheScope: "private" as const })
async function contents(uri: URL, read: Promise<CallToolResult>) {
  const result = await read
  if (result.isError) throw new ResourceNotFoundError(uri.href)
  const image = result.content?.find((c) => c.type === "image")
  if (image) return { contents: [{ uri: uri.href, mimeType: image.mimeType, blob: image.data }] }
  return {
    contents: [{ uri: uri.href, mimeType: json, text: JSON.stringify(result.structuredContent) }],
  }
}
export function registerResources(server: McpServer, pyxis: PyxisClient) {
  for (const [name, uri, ttlMs, read] of [
    ["albums", "pyxis://albums", 30000, () => albumPage(pyxis, {})],
    [
      "recent history",
      "pyxis://history/recent",
      5000,
      async () => data({ events: await history(pyxis) }),
    ],
    ["library", "pyxis://library", 30000, async () => data({ albums: await albums(pyxis) })],
    ["now playing", nowPlaying, 0, async () => data({ sessions: await sessions(pyxis) })],
    ["Sonos rooms", "pyxis://sonos/rooms", 0, async () => data({ ...(await rooms(pyxis)) })],
    ["tags", "pyxis://tags", 30000, () => tagCounts(pyxis)],
  ] as const)
    server.registerResource(name, uri, { mimeType: json, cacheHint: hint(ttlMs) }, (uri) =>
      contents(uri, read()),
    )
  for (const [name, pattern, read] of [
    ["album", "pyxis://albums/{albumId}", albumDetail],
    ["artwork", "pyxis://artwork/{albumId}", albumArtwork],
  ] as const)
    server.registerResource(
      name,
      new ResourceTemplate(pattern, { list: undefined }),
      { cacheHint: hint(30000) },
      (uri, { albumId }) => {
        if (typeof albumId !== "string" || !albumId || uri.search || uri.hash)
          throw new ResourceNotFoundError(uri.href)
        return contents(uri, read(pyxis, albumId))
      },
    )
}
