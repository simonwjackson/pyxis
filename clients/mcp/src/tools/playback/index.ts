import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import {
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../../contracts/generated/pyxis"
import { confirmAction } from "../../mrtr"
import { type PyxisClient, PyxisError } from "../../pyxis-client"
import { fail, label, resolveTarget, sessionFor, sessions } from "../../targets"
import { runTool } from "../result"
import { play, target, targetActions, tracks } from "./action"
import { namedQueue, result, send, sequence } from "./commands"
import { registerRooms } from "./rooms"
import { registerSelection } from "./selection"

const targetSchema = z.strictObject({ target })
const volumeSchema = z.strictObject({ target, volume: z.int().min(0).max(100) })

export function registerPlayback(server: McpServer, client: PyxisClient) {
  const { onTarget } = targetActions(client)
  const command = (s: RpcSession, c: RpcSessionCommand) => send(client, s.id, c).then(result)
  for (const [name, tag, description] of [
    ["playback.resume", "transport.play", "Resume playback of the current queue."],
    [
      "playback.takeover",
      "transport.play",
      "Explicitly take over an output renderer with its current Pyxis queue.",
    ],
    ["playback.pause", "transport.pause", "Pause the target session."],
    ["playback.stop", "transport.stop", "Stop playback and disarm the sleep timer."],
  ] as const)
    server.registerTool(name, { description, inputSchema: targetSchema }, ({ target }, ctx) =>
      onTarget(ctx, target, name, { play: tag === play._tag }, async (s) => {
        if (name === "playback.takeover" && !s.output)
          fail("mcp.notOutput", "Only an output session can take over a renderer")
        return command(s, { _tag: tag, payload: {} })
      }),
    )
  for (const [name, delta] of [
    ["playback.next", 1],
    ["playback.previous", -1],
  ] as const)
    server.registerTool(
      name,
      {
        description: "Select the adjacent queue occurrence. Continue playback if already playing.",
        inputSchema: targetSchema,
      },
      ({ target }, ctx) =>
        onTarget(ctx, target, name, { play: true }, async (s) => {
          const index = (s.cursor ?? -1) + delta
          if (index < 0 || index >= s.queue.length)
            fail("mcp.queueBoundary", "No adjacent track in this direction")
          const commands: RpcSessionCommand[] = [{ _tag: "cursor.jump", payload: { index } }]
          if (s.transport === RpcTransport.Playing) commands.push(play)
          return sequence(client, s, commands)
        }),
    )
  server.registerTool(
    "playback.seek",
    {
      description: "Seek to an absolute position in milliseconds.",
      inputSchema: z.strictObject({ target, positionMs: z.int().nonnegative() }),
    },
    ({ target, positionMs }, ctx) =>
      onTarget(ctx, target, `Seek to ${positionMs}ms`, {}, (s) =>
        command(s, { _tag: "transport.seek", payload: { positionMs } }),
      ),
  )
  for (const name of ["queue.add", "queue.play_next"] as const)
    server.registerTool(
      name,
      {
        description:
          name === "queue.add"
            ? "Append tracks to the queue without starting playback."
            : "Insert tracks immediately after the current occurrence; do not start playback.",
        inputSchema: z.strictObject({ target, trackIds: tracks }),
      },
      ({ target, trackIds }, ctx) =>
        onTarget(ctx, target, `${name} ${trackIds.join(", ")}`, { create: true }, (s) =>
          command(s, {
            _tag: "queue.add",
            payload: {
              trackIds,
              ...(name === "queue.play_next" && { index: (s.cursor ?? -1) + 1 }),
            },
          }),
        ),
    )
  server.registerTool(
    "queue.get",
    {
      description: "Read the effective queue with track metadata and explicit misses.",
      inputSchema: targetSchema,
      annotations: { readOnlyHint: true },
    },
    ({ target }, ctx) =>
      onTarget(ctx, target, "Read queue", {}, (s) => namedQueue(client, s).then(result)),
  )
  server.registerTool(
    "session.list",
    {
      description: "List reachable playback sessions.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true },
    },
    () => runTool(async () => result({ sessions: await sessions(client) })),
  )
  server.registerTool(
    "session.state",
    {
      description: "Read a session's transport, cursor, volume, timer and output binding.",
      inputSchema: targetSchema,
      annotations: { readOnlyHint: true },
    },
    ({ target }, ctx) => onTarget(ctx, target, "Read state", {}, async (s) => result({ ...s })),
  )
  for (const name of ["playback.volume", "room.volume"] as const)
    server.registerTool(
      name,
      {
        description: "Set the full Pyxis volume (0–100). On grouped rooms this controls the group.",
        inputSchema: volumeSchema,
      },
      ({ target, volume }, ctx) =>
        onTarget(
          ctx,
          target,
          `Set volume to ${volume}`,
          { roomOnly: name === "room.volume", create: true },
          (s) => command(s, { _tag: "volume.set", payload: { volume } }),
        ),
    )
  server.registerTool(
    "playback.mute",
    {
      description: "Set the session volume to zero. Use playback.volume to set it again.",
      inputSchema: targetSchema,
    },
    ({ target }, ctx) =>
      onTarget(ctx, target, "Mute", {}, (s) =>
        command(s, { _tag: "volume.set", payload: { volume: 0 } }),
      ),
  )
  server.registerTool(
    "sleep.set",
    {
      description:
        "Set the sleep timer. Supply exactly one of minutes or an RFC 3339 time with offset.",
      inputSchema: z
        .strictObject({
          target,
          minutes: z.uint32().positive().optional(),
          at: z.iso.datetime({ offset: true }).optional(),
          fadeSeconds: z.uint32().optional(),
        })
        .refine(
          (a) => Number(a.minutes !== undefined) + Number(a.at !== undefined) === 1,
          "Supply exactly one deadline",
        ),
    },
    ({ target, minutes, at, fadeSeconds }, ctx) =>
      onTarget(
        ctx,
        target,
        `Set sleep timer ${at ?? `${minutes} minutes`} with ${fadeSeconds ?? 0}s fade`,
        {},
        (s) =>
          command(s, {
            _tag: "sleep.set",
            payload: {
              ...(at !== undefined && { at }),
              ...(minutes !== undefined && { minutes }),
              ...(fadeSeconds !== undefined && { fadeSeconds }),
            },
          }),
      ),
  )
  server.registerTool(
    "sleep.cancel",
    { description: "Disarm the sleep timer without stopping playback.", inputSchema: targetSchema },
    ({ target }, ctx) =>
      onTarget(ctx, target, "Cancel timer", {}, (s) =>
        command(s, { _tag: "sleep.cancel", payload: {} }),
      ),
  )
  server.registerTool(
    "sleep.get",
    {
      description: "Read the sleep deadline and fade or null when disarmed.",
      inputSchema: targetSchema,
      annotations: { readOnlyHint: true },
    },
    ({ target }, ctx) =>
      onTarget(ctx, target, "Read timer", {}, async (s) =>
        result({ sessionId: s.id, sleepTimer: s.sleepTimer ?? null }),
      ),
  )
  registerSelection(server, client)
  server.registerTool(
    "session.handoff",
    {
      description:
        "Move playback from one reachable device session to another empty device session. Outputs are not supported.",
      inputSchema: z.strictObject({ from: target, to: target }),
    },
    ({ from, to }, ctx) =>
      runTool(async () => {
        const a = await resolveTarget(client, from),
          b = await resolveTarget(client, to)
        if (a.ambiguous || b.ambiguous || a.session?.queue.length) {
          const prompt = confirmAction(
            ctx,
            `Hand off ${a.description} to ${b.description}, leaving the source idle?`,
          )
          if (prompt) return prompt
        }
        const source = await sessionFor(client, a),
          dest = await sessionFor(client, b)
        const r = await client.call({
          _tag: "session.handoff",
          payload: { sessionId: source.id, targetSessionId: dest.id },
        })
        if (r.status !== "ready") fail(`session.${r.status}`, `Handoff: ${r.status}`)
        return result({ ...r.value })
      }),
  )
  server.registerTool(
    "playback.stop_all",
    {
      description:
        "Send Stop to each reachable session, including sessions with pending sleep timers.",
      inputSchema: z.strictObject({}),
    },
    (_, ctx) =>
      runTool(async () => {
        const targets = (await sessions(client)).sort((a, b) => a.id.localeCompare(b.id))
        const prompt =
          targets.length &&
          confirmAction(ctx, `Stop all reachable sessions: ${targets.map(label).join(", ")}?`)
        if (prompt) return prompt
        const outcomes = []
        for (const s of targets) {
          try {
            outcomes.push(await send(client, s.id, { _tag: "transport.stop", payload: {} }))
          } catch (error) {
            if (!(error instanceof PyxisError)) throw error
            outcomes.push({ sessionId: s.id, failure: error.failure })
          }
        }
        return { ...result({ outcomes }), isError: outcomes.some((o) => "failure" in o) }
      }),
  )
  registerRooms(server, client)
}
