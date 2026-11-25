import type { RpcOutputTopology, RpcSession } from "../../../contracts/generated/pyxis"
import { type PyxisClient, PyxisError } from "./pyxis-client"

export function fail(code: string, message: string): never {
  throw new PyxisError({ code, message, retryable: false })
}

export function sessions(client: PyxisClient, includeUnreachable = false) {
  return client.call({ _tag: "session.list", payload: { includeUnreachable } }).then((r) => r.value)
}

export function rooms(client: PyxisClient) {
  return client
    .call({ _tag: "output.targets.list", payload: { pluginId: "sonos" } })
    .then((r) => r.value)
}

export function matchRoom(topology: RpcOutputTopology, query: string) {
  const all = topology.groups.flatMap((group) => group.rooms.map((room) => ({ room, group })))
  const exact = all.find(({ room }) => room.id === query)
  const matches = exact
    ? [exact]
    : all
        .filter(({ room }) => sameName(room.name, query))
        .sort((a, b) => a.room.id.localeCompare(b.room.id))
  const first = matches[0] ?? fail("mcp.unknownRoom", `No Sonos room matches ${query}`)
  return { ...first, ambiguous: matches.length > 1 }
}

const sameName = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase()
export const label = ({ name, id }: { name: string; id: string }) => `${name} (${id})`

// Resolution is read-only. In particular an MRTR decline must not claim an output room.
export async function resolveTarget(client: PyxisClient, query: string, roomOnly = false) {
  if (!roomOnly) {
    const all = await sessions(client, true)
    const exact = all.find((s) => s.id === query)
    const matches = exact
      ? [exact]
      : all
          .filter((s) => s.reachable && sameName(s.name, query))
          .sort(
            (a, b) =>
              Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
              b.updatedAt.localeCompare(a.updatedAt) ||
              a.id.localeCompare(b.id),
          )
    const session = matches[0]
    if (session) return { session, ambiguous: matches.length > 1, description: label(session) }
  }
  const { room, group, ambiguous } = matchRoom(await rooms(client), query)
  const session = (await sessions(client)).find(
    (s) => s.output?.pluginId === "sonos" && group.rooms.some((r) => r.id === s.output?.targetId),
  )
  return {
    room,
    coordinatorId: group.coordinatorId,
    session,
    ambiguous,
    description: [
      label(room),
      `group ${group.coordinatorName} (${group.coordinatorId})`,
      session && label(session),
    ]
      .filter(Boolean)
      .join(", "),
  }
}

export type Target = Awaited<ReturnType<typeof resolveTarget>>
export async function sessionFor(
  client: PyxisClient,
  target: Target,
  create = false,
): Promise<RpcSession> {
  if (target.session) {
    const state = await client.call({
      _tag: "session.state.get",
      payload: { sessionId: target.session.id },
    })
    if (state.status !== "ready") fail(`session.${state.status}`, target.description)
    return state.value
  }
  if (!target.room || !create) fail("mcp.noSession", `No session on ${target.description}`)
  const created = await client.call({
    _tag: "output.session.create",
    payload: { pluginId: "sonos", targetId: target.room.id, name: target.room.name },
  })
  if (created.status !== "ready") fail(`output.${created.status}`, target.description)
  // Another controller may have regrouped or claimed this room since the prompt.
  if (created.value.output?.targetId !== target.coordinatorId || created.value.queue.length) {
    throw new PyxisError({
      code: "mcp.targetChanged",
      message: "Room ownership or queue changed; resolve the target again",
      retryable: true,
    })
  }
  return created.value
}
