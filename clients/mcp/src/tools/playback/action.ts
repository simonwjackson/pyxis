import type { ServerContext } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { RpcSession } from "../../../../../contracts/generated/pyxis"
import { confirmAction } from "../../mrtr"
import type { PyxisClient } from "../../pyxis-client"
import { fail, resolveTarget, sessionFor, type Target } from "../../targets"
import { runTool } from "../result"
import { type result, sequence } from "./commands"

export const text = z.string().trim().min(1)
export const target = text.describe("Session ID, reachable session name, or Sonos room name/ID")
export const tracks = z.array(text).min(1).describe("Ordered Pyxis track IDs (duplicates allowed)")
export const play = { _tag: "transport.play", payload: {} } as const

type Options = { play?: boolean; roomOnly?: boolean; create?: boolean; replace?: boolean }
type Run<T> = (target: T) => Promise<ReturnType<typeof result>>

export function targetActions(client: PyxisClient) {
  function confirmed(
    ctx: ServerContext,
    query: string,
    action: string,
    options: Options,
    run: Run<Target>,
  ) {
    return runTool(async () => {
      const t = await resolveTarget(client, query, options.roomOnly)
      const warnings = [
        t.ambiguous && `Several targets match ${query}.`,
        // The core exposes no foreign-stream flag. Even a stopped output may be playing other audio.
        options.play && (t.room || t.session?.output) && "Play may take over another app's stream.",
        options.replace && t.session?.queue.length && "Replace the existing queue.",
      ].filter(Boolean)
      if (warnings.length) {
        const prompt = confirmAction(ctx, `${warnings.join(" ")} ${action} on ${t.description}?`)
        if (prompt) return prompt
      }
      return run(t)
    })
  }
  return {
    onTarget(
      ctx: ServerContext,
      query: string,
      action: string,
      options: Options,
      run: Run<RpcSession>,
    ) {
      return confirmed(ctx, query, action, options, async (t) =>
        run(await sessionFor(client, t, options.create)),
      )
    },
    select(
      ctx: ServerContext,
      query: string,
      action: string,
      load: () => Promise<string[]>,
      roomOnly = false,
    ) {
      return confirmed(ctx, query, action, { play: true, replace: true, roomOnly }, async (t) => {
        const trackIds = await load()
        if (!trackIds.length) fail("mcp.emptySelection", "Nothing to play; queue not replaced")
        // Selection can fail or be empty. Do not claim a room or clear a queue until it succeeds.
        const s = await sessionFor(client, t, true)
        return sequence(client, s, [
          { _tag: "queue.clear", payload: {} },
          { _tag: "queue.add", payload: { trackIds } },
          play,
        ])
      })
    },
  }
}
