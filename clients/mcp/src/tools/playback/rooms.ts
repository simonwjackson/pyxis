import type { McpServer, ServerContext } from "@modelcontextprotocol/server"
import { z } from "zod"
import { confirmAction } from "../../mrtr"
import type { PyxisClient } from "../../pyxis-client"
import { label, matchRoom, rooms, sessions } from "../../targets"
import { runTool } from "../result"
import { result } from "./commands"

export function registerRooms(server: McpServer, client: PyxisClient) {
  const room = z.string().trim().min(1).describe("Sonos room name or ID")
  server.registerTool(
    "room.list",
    {
      description: "Discover current Sonos groups, coordinators and rooms.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true },
    },
    () => runTool(async () => result({ ...(await rooms(client)) })),
  )
  function group(ctx: ServerContext, query: string, others: string[]) {
    return runTool(async () => {
      const topology = await rooms(client)
      const first = matchRoom(topology, query)
      const selected = [first, ...others.map((q) => matchRoom(topology, q))]
      const coordinator = first.room
      const memberIds = [...new Set(selected.map((s) => s.room.id))].sort()
      const released = (await sessions(client, true))
        .filter(
          (s) =>
            s.output?.pluginId === "sonos" &&
            selected.some(
              ({ room, group }) =>
                room.id === s.output?.targetId &&
                room.id !== coordinator.id &&
                group.coordinatorId !== coordinator.id,
            ),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
      if (released.length || selected.some((s) => s.ambiguous)) {
        const prompt = confirmAction(
          ctx,
          `Set group ${selected.map((s) => label(s.room)).join(", ")} under ${label(coordinator)}? Release sessions: ${released.map(label).join(", ") || "none"}.`,
        )
        if (prompt) return prompt
      }
      const r = await client.call({
        _tag: "output.group.set",
        payload: { pluginId: "sonos", coordinatorId: coordinator.id, memberIds },
      })
      return result({ ...r.value })
    })
  }
  server.registerTool(
    "room.group",
    {
      description: "Set the complete desired Sonos group. Omitted rooms may become standalone.",
      inputSchema: z.strictObject({ coordinator: room, members: z.array(room).min(1) }),
    },
    ({ coordinator, members }, ctx) => group(ctx, coordinator, members),
  )
  server.registerTool(
    "room.ungroup",
    {
      description: "Make the specified Sonos room standalone.",
      inputSchema: z.strictObject({ room }),
    },
    ({ room }, ctx) => group(ctx, room, []),
  )
}
