import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { RPC_CONTRACT_ID } from "../../../contracts/generated/pyxis"
import { PyxisClient } from "../src/pyxis-client"
import { startHarness } from "./harness"
import { buildLab, installLab, topology } from "./playback/fixture"

let h: Awaited<ReturnType<typeof startHarness>>,
  dir: string,
  first: string,
  best: string,
  albumId: string
beforeAll(buildLab, 120_000)
beforeEach(async () => {
  h = await startHarness({
    scopes: ["source:read", "library:read", "session:read", "session:control"],
    loopbackMedia: true,
    prepareState: async (path) => {
      dir = path
      await installLab(path)
    },
  })
  const r = await h.owner.call({ _tag: "source.search.run", payload: { query: "Fixture" } })
  if (r.status !== "ready") throw Error(r.status)
  const [a, b] = r.value.tracks
  if (!a || !b) throw Error(JSON.stringify(r))
  first = a.id
  best = b.id
  const album = await h.owner.call({
    _tag: "library.album.add",
    payload: {
      title: "Fixture",
      artist: "Fixture",
      tracks: [a, b].map(({ id, title, artist }, i) => ({
        id,
        title,
        artist,
        durationMs: 180_000,
        trackNumber: i + 1,
      })),
    },
  })
  albumId = album.value.id
})
afterEach(async () => {
  await h?.close()
})
const form = { elicitation: { form: {} } }
const completion = z.object({
  resultType: z.literal("complete"),
  isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.unknown()),
})
async function call(
  name: string,
  args: Record<string, unknown>,
  capabilities = {},
  inputResponses?: Record<string, unknown>,
) {
  const res = await h.post(
    "tools/call",
    { name, arguments: args, inputResponses },
    { capabilities },
  )
  expect(res.status).toBe(200)
  return z.object({ result: z.unknown() }).parse(await res.json()).result
}
async function ok(name: string, args: Record<string, unknown>) {
  const r = completion.parse(await call(name, args))
  expect(r.isError, JSON.stringify(r)).not.toBe(true)
  return r.structuredContent
}
const room = { target: "Room A" }
const state = () => ok("session.state", room)
async function question(name: string, args: Record<string, unknown>) {
  const r = z
    .object({
      resultType: z.literal("input_required"),
      inputRequests: z.record(z.string(), z.object({ params: z.object({ message: z.string() }) })),
    })
    .parse(await call(name, args, form))
  const entry = Object.entries(r.inputRequests)[0]
  if (!entry) throw Error("Missing question")
  return {
    message: entry[1].params.message,
    yes: { [entry[0]]: { action: "accept", content: { confirm: true } } },
    no: { [entry[0]]: { action: "decline" } },
  }
}
test("output transport changes the queue occurrence, seek position, volume and timer on the real core", async () => {
  await ok("playback.album", { ...room, albumId })
  expect(await state()).toMatchObject({ queue: [first, best], transport: "playing", cursor: 0 })
  await ok("playback.next", room)
  expect(await state()).toMatchObject({ cursor: 1, transport: "playing" })
  await ok("playback.previous", room)
  expect(await state()).toMatchObject({ cursor: 0, transport: "playing" })
  await ok("playback.seek", { ...room, positionMs: 5000 })
  expect(await state()).toMatchObject({ positionMs: 5000 })
  await ok("playback.pause", room)
  expect(await state()).toMatchObject({ transport: "paused" })
  await ok("playback.resume", room)
  expect(await state()).toMatchObject({ transport: "playing" })
  await ok("room.volume", { ...room, volume: 100 })
  expect(await state()).toMatchObject({ volume: 100 })
  await ok("playback.mute", room)
  expect(await state()).toMatchObject({ volume: 0 })
  await ok("playback.volume", { ...room, volume: 99 })
  expect(await state()).toMatchObject({ volume: 99 })
  await ok("sleep.set", { ...room, minutes: 30, fadeSeconds: 12 })
  expect(await ok("sleep.get", room)).toMatchObject({ sleepTimer: { fadeSeconds: 12 } })
  const at = new Date(Date.now() + 3600_000).toISOString()
  await ok("sleep.set", { ...room, at })
  const timer = z
    .object({ sleepTimer: z.object({ deadline: z.string(), fadeSeconds: z.literal(0) }) })
    .parse(await ok("sleep.get", room))
  expect(Date.parse(timer.sleepTimer.deadline)).toBe(Date.parse(at))
  await ok("sleep.cancel", room)
  expect(await ok("sleep.get", room)).toMatchObject({ sleepTimer: null })
  await ok("playback.stop", room)
  expect(await state()).toMatchObject({ transport: "stopped" })
  await ok("playback.play", room)
  expect(await state()).toMatchObject({ transport: "playing" })
})
test("invalid selections neither claim a room nor replace a queue", async () => {
  expect(await call("playback.album", { ...room, albumId: "absent" })).toMatchObject({
    isError: true,
    structuredContent: { code: "mcp.unknownAlbum" },
  })
  expect(await ok("session.list", {})).toEqual({ sessions: [] })
  await ok("playback.play", { ...room, trackIds: [first] })
  expect(await call("playback.album", { ...room, albumId: "absent" })).toMatchObject({
    isError: true,
  })
  expect(await state()).toMatchObject({ queue: [first], transport: "playing" })
})

test("queue lookup preserves duplicates, order, explicit misses and names beyond the 200-ID RPC limit", async () => {
  await ok("queue.add", {
    ...room,
    trackIds: [first, ...Array.from({ length: 201 }, (_, i) => `miss-${i}`), first],
  })
  await ok("queue.play_next", { ...room, trackIds: [best, best] })
  const r = await ok("queue.get", room)
  expect(r.cursor).toBe(0)
  expect(r.tracks).toEqual([
    expect.objectContaining({ id: first, title: "First" }),
    ...[1, 2].map(() => expect.objectContaining({ id: best, title: "Best" })),
    ...Array.from({ length: 201 }, (_, i) => ({ id: `miss-${i}`, missing: true })),
    expect.objectContaining({ id: first, title: "First" }),
  ])
})
test("room play confirms before claiming the room; a takeover decline leaves a foreign stream alone", async () => {
  const args = { ...room, trackIds: [best] }
  const start = await question("room.play", args)
  expect(start.message).toContain("Room A (A)")
  expect(await ok("session.list", {})).toEqual({ sessions: [] })
  expect(await call("room.play", args, form, start.yes)).toMatchObject({
    structuredContent: { status: "dispatched" },
  })
  await writeFile(
    join(dir, "state"),
    JSON.stringify({ state: "PLAYING", streamUrl: "http://foreign.invalid/music" }),
  )
  expect(await call("playback.volume", { ...room, volume: 33 })).toMatchObject({
    isError: true,
    structuredContent: { code: "output.rendererOwnershipLost" },
  })
  const q = await question("playback.takeover", room)
  expect(q.message).toContain("take over")
  expect(await call("playback.takeover", room, form, q.no)).toMatchObject({
    content: [{ text: expect.stringContaining("no change") }],
  })
  expect(await call("playback.volume", { ...room, volume: 33 })).toMatchObject({
    isError: true,
    structuredContent: { code: "output.rendererOwnershipLost" },
  })
  expect(await call("playback.takeover", room, form, q.yes)).toMatchObject({
    structuredContent: { status: "dispatched" },
  })
  await ok("room.volume", { ...room, volume: 33 })
})
test("find and play prefers an exact match; non-library output errors do not silently capture an album", async () => {
  await ok("playback.find_and_play", { ...room, query: "Best" })
  expect(await state()).toMatchObject({ queue: [best], transport: "playing" })
  expect(await call("playback.find_and_play", { ...room, query: "Outside" })).toMatchObject({
    isError: true,
    structuredContent: {
      code: "output.invalidResponse",
      retryable: false,
      message: expect.stringContaining("missing"),
    },
  })
  expect(
    (await h.owner.call({ _tag: "library.albums.list", payload: {} })).value.map((a) => a.id),
  ).toEqual([albumId])
  for (const [name, args] of [
    ["station.play", { stationId: "radio" }],
    ["station.from_track", { externalId: "Best" }],
  ] as const) {
    await ok(name, { ...room, pluginId: "catalog", ...args })
    expect(await state()).toMatchObject({ queue: [first, best], transport: "playing" })
  }
})
test("regroup asks before releasing the moved session; ungroup and stop-all work without MRTR", async () => {
  expect(await ok("room.list", {})).toMatchObject({
    groups: [{ coordinatorId: "A" }, { coordinatorId: "B" }],
  })
  await ok("room.play", { target: "Room B", trackIds: [first] })
  const b = await ok("session.state", { target: "Room B" })
  expect(b.id).toBeString()
  await writeFile(join(dir, "group"), JSON.stringify(topology(true)))
  const args = { coordinator: "Room A", members: ["Room B"] }
  const q = await question("room.group", args)
  expect(q.message).toContain(String(b.id))
  expect(await ok("session.state", { target: b.id })).toMatchObject({ reachable: true })
  expect(await call("room.group", args, form, q.yes)).toMatchObject({
    structuredContent: { groups: [{ coordinatorId: "A" }] },
  })
  expect(await ok("session.state", { target: b.id })).toMatchObject({
    transport: "stopped",
    reachable: false,
  })
  await writeFile(join(dir, "topology"), JSON.stringify(topology(true)))
  await writeFile(join(dir, "group"), JSON.stringify(topology(false)))
  expect(await ok("room.ungroup", { room: "Room B" })).toMatchObject({
    groups: [{ coordinatorId: "A" }, { coordinatorId: "B" }],
  })
  await writeFile(join(dir, "topology"), JSON.stringify(topology(false)))
  await ok("room.play", { ...room, trackIds: [best] })
  expect((await question("playback.stop_all", {})).message).toContain("Room A")
  await ok("playback.stop_all", {})
  expect(await state()).toMatchObject({ transport: "stopped" })
})
async function deviceSession(client: PyxisClient, name: string) {
  const r = await client.call({ _tag: "session.create", payload: { name } })
  if (r.status !== "ready") throw Error(r.status)
  return r.value.id
}
test("ambiguous session name uses latest reachable match, and handoff moves its queue by ID", async () => {
  const ws = new WebSocket(new URL("/realtime", h.baseUrl).href.replace(/^http/, "ws"))
  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            _tag: "realtime.hello",
            payload: { contractId: RPC_CONTRACT_ID, bearerToken: h.device.bearerToken, topics: [] },
          }),
        )
      ws.onmessage = (e) =>
        JSON.parse(e.data)._tag === "realtime.welcome" ? resolve() : reject(Error(e.data))
      ws.onerror = () => reject(Error("socket failed"))
    })
    const dest = await deviceSession(h.owner, "Den"),
      src = await deviceSession(h.owner, "Den")
    await h.owner.call({
      _tag: "session.command.run",
      payload: { sessionId: src, command: { _tag: "queue.add", payload: { trackIds: [best] } } },
    })
    const pairing = await h.owner.call({ _tag: "auth.pairing.create", payload: {} })
    const peer = await new PyxisClient(h.baseUrl).call({
      _tag: "auth.device.pair",
      payload: { name: "offline", code: pairing.value.code },
    })
    if (peer.status !== "ready") throw Error(peer.status)
    await deviceSession(new PyxisClient(h.baseUrl, `Bearer ${peer.value.bearerToken}`), "Den")
    expect((await question("session.state", { target: "Den" })).message).toContain(src)
    expect(await ok("session.state", { target: "Den" })).toMatchObject({ id: src })
    await ok("session.handoff", { from: src, to: dest })
    expect(await ok("session.state", { target: dest })).toMatchObject({ queue: [best] })
    expect(await ok("session.state", { target: src })).toMatchObject({ queue: [] })
  } finally {
    ws.close()
  }
})
