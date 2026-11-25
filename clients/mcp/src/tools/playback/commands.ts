import type {
  RpcSession,
  RpcSessionCommand,
  RpcTrackMetadata,
} from "../../../../../contracts/generated/pyxis"
import type { PyxisClient } from "../../pyxis-client"
import { PyxisError } from "../../pyxis-client"
import { fail } from "../../targets"

export function result(value: Record<string, unknown>) {
  return {
    structuredContent: value,
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  }
}

export async function send(client: PyxisClient, sessionId: string, command: RpcSessionCommand) {
  const r = await client.call({ _tag: "session.command.send", payload: { sessionId, command } })
  if (r.status !== "dispatched")
    fail(`session.${r.status}`, `${command._tag} to ${sessionId}: ${r.status}`)
  return { sessionId, status: r.status }
}

export async function sequence(
  client: PyxisClient,
  session: RpcSession,
  commands: RpcSessionCommand[],
) {
  const dispatched: string[] = []
  for (const command of commands) {
    try {
      await send(client, session.id, command)
    } catch (error) {
      if (!(error instanceof PyxisError) || !dispatched.length) throw error
      throw new PyxisError({
        ...error.failure,
        message: `Dispatched ${dispatched.join(", ")} to ${session.id} before ${command._tag} failed: ${error.message}`,
      })
    }
    dispatched.push(command._tag)
  }
  return result({ sessionId: session.id, status: "dispatched", commands: dispatched })
}

export async function namedQueue(client: PyxisClient, session: RpcSession) {
  const ids = [...new Set(session.queue)]
  const byId = new Map<string, RpcTrackMetadata>()
  for (let offset = 0; offset < ids.length; offset += 200) {
    const r = await client.call({
      _tag: "library.tracks.get",
      payload: { trackIds: ids.slice(offset, offset + 200) },
    })
    for (const track of r.value.tracks) byId.set(track.id, track)
  }
  return {
    sessionId: session.id,
    cursor: session.cursor ?? null,
    tracks: session.queue.map((id) => byId.get(id) ?? { id, missing: true }),
  }
}
