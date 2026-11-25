import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { RpcOverrideDecision, RpcTransport } from "../../../../../contracts/generated/pyxis"
import { confirmAction } from "../../mrtr"
import type { PyxisClient } from "../../pyxis-client"
import { data, id, invalid, outcome, tool } from "./tools"

export function registerCollections(server: McpServer, pyxis: PyxisClient) {
  tool(server, "bookmarks.list", "List bookmarked tracks.", {}, "read", async () =>
    outcome(await pyxis.call({ _tag: "library.bookmarks.list", payload: {} })),
  )
  tool(
    server,
    "bookmarks.add",
    "Bookmark an account track.",
    { trackId: id },
    "write",
    async ({ trackId }) =>
      outcome(
        await pyxis.call({
          _tag: "library.bookmark.command.run",
          payload: { trackId, command: { _tag: "add", payload: {} } },
        }),
      ),
  )
  tool(
    server,
    "bookmarks.remove",
    "Remove a track bookmark.",
    { trackId: id },
    "write",
    async ({ trackId }, ctx) =>
      confirmAction(ctx, `Remove bookmark for ${trackId}?`) ??
      outcome(
        await pyxis.call({
          _tag: "library.bookmark.command.run",
          payload: { trackId, command: { _tag: "remove", payload: {} } },
        }),
      ),
  )
  tool(server, "playlists.list", "List playlists and their track IDs.", {}, "read", async () =>
    outcome(await pyxis.call({ _tag: "library.playlists.list", payload: {} })),
  )
  tool(
    server,
    "playlists.create",
    "Create a named playlist of ordered tracks.",
    { title: id, trackIds: z.array(id) },
    "write",
    async (args) => outcome(await pyxis.call({ _tag: "library.playlist.create", payload: args })),
  )
  tool(
    server,
    "playlists.append",
    "Append tracks in order, including repeats. Reuse commandId for an identical retry.",
    { playlistId: id, trackIds: z.array(id).min(1).max(1000), commandId: id.max(128) },
    "write",
    async (args) =>
      outcome(await pyxis.call({ _tag: "library.playlist.tracks.add", payload: args })),
  )
  tool(
    server,
    "matching.wrongSong",
    "Record a split between the track now playing on a specific session and the other incorrectly matched item. Refuses if the track changed.",
    { sessionId: id, currentTrackId: id, otherId: id },
    "write",
    async ({ sessionId, currentTrackId, otherId }, ctx) => {
      if (currentTrackId === otherId) invalid("Choose two distinct recording IDs.")
      const result = await pyxis.call({ _tag: "session.state.get", payload: { sessionId } })
      if (result.status !== "ready") return outcome(result)
      if (
        !result.value.reachable ||
        result.value.transport !== RpcTransport.Playing ||
        result.value.currentTrackId !== currentTrackId
      )
        return data({ status: "notNowPlaying" }, true)
      return (
        confirmAction(
          ctx,
          `Split playing track ${currentTrackId} on ${sessionId} from ${otherId}?`,
        ) ??
        outcome(
          await pyxis.call({
            _tag: "matching.override.set",
            payload: {
              leftId: currentTrackId,
              rightId: otherId,
              decision: RpcOverrideDecision.Split,
            },
          }),
        )
      )
    },
  )
}
