import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { StationSeedKind } from "../../../../../contracts/generated/pyxis"
import { type PyxisClient, PyxisError } from "../../pyxis-client"
import { fail } from "../../targets"
import { play, target, targetActions, text, tracks } from "./action"
import { result, send } from "./commands"

export function registerSelection(server: McpServer, client: PyxisClient) {
  const { select, onTarget } = targetActions(client)
  for (const name of ["playback.play", "room.play"] as const)
    server.registerTool(
      name,
      {
        description:
          name === "room.play"
            ? "Play in a Sonos room (its group if grouped). Supply trackIds to replace its queue."
            : "Play the selected track, or supply trackIds to replace the queue and play.",
        inputSchema: z.strictObject({ target, trackIds: tracks.optional() }),
      },
      ({ target, trackIds }, ctx) =>
        trackIds
          ? select(
              ctx,
              target,
              `Play ${trackIds.join(", ")}`,
              async () => trackIds,
              name === "room.play",
            )
          : onTarget(
              ctx,
              target,
              "Play queue",
              { roomOnly: name === "room.play", play: true },
              (s) => send(client, s.id, play).then(result),
            ),
    )
  server.registerTool(
    "playback.album",
    {
      description: "Replace the queue with a library album and play it.",
      inputSchema: z.strictObject({ target, albumId: text }),
    },
    ({ target, albumId }, ctx) =>
      select(ctx, target, `Play album ${albumId}`, async () => {
        const albums = await client.call({ _tag: "library.albums.list", payload: {} })
        const album =
          albums.value.find((a) => a.id === albumId) ??
          fail("mcp.unknownAlbum", `Unknown library album: ${albumId}`)
        return album.tracks.map((t) => t.id)
      }),
  )
  server.registerTool(
    "playback.find_and_play",
    {
      description:
        "Search sources for a song and replace the queue with the best track (exact title or artist/title first, then source order). Sonos requires a library track.",
      inputSchema: z.strictObject({ target, query: text }),
    },
    ({ target, query }, ctx) =>
      select(ctx, target, `Find and play ${query}`, async () => {
        const r = await client.call({ _tag: "source.search.run", payload: { query, limit: 10 } })
        if (r.status !== "ready") fail(`source.${r.status}`, "No sources available for search")
        const q = query.toLowerCase()
        const match =
          r.value.tracks.find((t) =>
            [t.title, `${t.artist} ${t.title}`, `${t.artist} - ${t.title}`].some(
              (key) => key.toLowerCase() === q,
            ),
          ) ?? r.value.tracks[0]
        if (!match) {
          const failure = r.value.failures[0]
          if (failure) throw new PyxisError(failure.failure)
          fail("mcp.noMatch", `No song matches ${query}`)
        }
        return [match.id]
      }),
  )
  async function stationTracks(pluginId: string, stationId: string) {
    const batch = await client.call({
      _tag: "source.station.next",
      payload: { pluginId, stationId },
    })
    if (batch.status !== "ready")
      fail(`station.${batch.status}`, `Station ${stationId}: ${batch.status}`)
    return batch.value.tracks.map((t) => t.id)
  }
  server.registerTool(
    "station.play",
    {
      description:
        "Replace the queue with one bounded station batch and play. Sonos requires library tracks.",
      inputSchema: z.strictObject({ target, pluginId: text, stationId: text }),
    },
    ({ target, pluginId, stationId }, ctx) =>
      select(ctx, target, `Play station ${pluginId}/${stationId}`, () =>
        stationTracks(pluginId, stationId),
      ),
  )
  server.registerTool(
    "station.from_track",
    {
      description:
        "Create a station from a source search track's externalId, then play its first batch. Sonos requires library tracks.",
      inputSchema: z.strictObject({ target, pluginId: text, externalId: text }),
    },
    ({ target, pluginId, externalId }, ctx) =>
      select(ctx, target, `Start station from ${pluginId}/${externalId}`, async () => {
        const r = await client.call({
          _tag: "source.station.create",
          payload: { pluginId, seed: { kind: StationSeedKind.Track, externalId } },
        })
        if (r.status !== "ready") fail(`station.${r.status}`, `${pluginId}: ${r.status}`)
        return stationTracks(pluginId, r.value.externalId)
      }),
  )
}
