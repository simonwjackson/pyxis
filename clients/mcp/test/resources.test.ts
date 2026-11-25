import { afterAll, beforeAll, expect, test } from "bun:test"
import { z } from "zod"
import { startHarness } from "./harness"
import { buildLab, installLab } from "./playback/fixture"

let h: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  buildLab()
  h = await startHarness({
    prepareState: installLab,
    scopes: ["session:read", "library:read", "listen:read"],
  })
}, 120000)
afterAll(async () => {
  await h?.close()
})
const jsonRead = z.object({
  result: z.object({
    ttlMs: z.number().int().nonnegative(),
    cacheScope: z.literal("private"),
    contents: z.tuple([
      z.object({ uri: z.string(), mimeType: z.literal("application/json"), text: z.string() }),
    ]),
  }),
})
test("discovery lists fixed resources and album templates in deterministic order", async () => {
  expect(await (await h.post("server/discover")).json()).toMatchObject({
    result: { capabilities: { resources: { subscribe: true }, prompts: {} } },
  })
  for (const [method, key, field, expected] of [
    [
      "resources/list",
      "resources",
      "uri",
      [
        "pyxis://albums",
        "pyxis://history/recent",
        "pyxis://library",
        "pyxis://now-playing",
        "pyxis://sonos/rooms",
        "pyxis://tags",
      ],
    ],
    [
      "resources/templates/list",
      "resourceTemplates",
      "uriTemplate",
      ["pyxis://albums/{albumId}", "pyxis://artwork/{albumId}"],
    ],
  ] as const) {
    const body = z
      .object({ result: z.record(z.string(), z.unknown()) })
      .parse(await (await h.post(method)).json())
    expect(
      z
        .array(z.record(z.string(), z.unknown()))
        .parse(body.result[key])
        .map((r) => r[field]),
    ).toEqual([...expected])
  }
})
test("resource reads match tool data from the same account and Sonos laboratory", async () => {
  const album = await h.owner.call({
    _tag: "library.album.add",
    payload: { artist: "Library", title: "Night", tracks: [{ title: "One", artist: "Library" }] },
  })
  const { id: albumId, tracks } = album.value
  await h.owner.call({
    _tag: "library.album.command.run",
    payload: { albumId, command: { _tag: "tags.set", payload: { tags: ["night", "ambient"] } } },
  })
  const track = tracks[0]
  if (!track) throw Error("Missing track")
  await h.owner.call({
    _tag: "listen.events.append",
    payload: {
      events: [
        {
          id: "01KH49HEV83YS7GQ4SQRMMC1M0",
          trackId: track.id,
          deviceId: h.device.device.id,
          listenedAt: "2026-01-01T12:00:00Z",
          completed: true,
          context: "library",
        },
      ],
    },
  })
  for (const [uri, name, args] of [
    ["pyxis://albums", "library.albums", {}],
    [`pyxis://albums/${albumId}`, "library.album", { albumId }],
    [`pyxis://artwork/${albumId}`, "library.artwork", { albumId }],
    ["pyxis://tags", "library.tags", {}],
    ["pyxis://now-playing", "session.list", {}],
    ["pyxis://sonos/rooms", "room.list", {}],
    ["pyxis://history/recent", "history.recent", {}],
    ["pyxis://library", "organizer.snapshot", {}],
  ] as const) {
    const tool = z
      .object({
        result: z.object({
          structuredContent: z.record(z.string(), z.unknown()),
          isError: z.literal(false).optional(),
        }),
      })
      .parse(await (await h.post("tools/call", { name, arguments: args })).json())
    const response = await (await h.post("resources/read", { uri })).json()
    const {
      contents: [item],
    } = jsonRead.parse(response).result
    expect(item.uri).toBe(uri)
    expect(JSON.parse(item.text)).toEqual(tool.result.structuredContent)
  }
  const uri = "pyxis://albums/missing"
  expect(await (await h.post("resources/read", { uri })).json()).toMatchObject({
    error: { code: -32602, data: { uri } },
  })
})
test("both prompts list and render user messages that use the registered tools", async () => {
  const list = z
    .object({ result: z.object({ prompts: z.array(z.object({ name: z.string() })) }) })
    .parse(await (await h.post("prompts/list")).json())
  expect(list.result.prompts.map((p) => p.name)).toEqual(["DJ", "Rediscover"])
  for (const [name, args, terms] of [
    ["DJ", { mood: "a rainy afternoon" }, ["a rainy afternoon", "library.byTag", "playback.album"]],
    ["Rediscover", {}, ["history.neglected", "organizer.snapshot", "Offer to play"]],
  ] as const) {
    const response = await (await h.post("prompts/get", { name, arguments: args })).json()
    const messages = z
      .object({
        result: z.object({
          messages: z.tuple([
            z.object({
              role: z.literal("user"),
              content: z.object({ type: z.literal("text"), text: z.string() }),
            }),
          ]),
        }),
      })
      .parse(response).result.messages
    for (const term of terms) expect(messages[0].content.text).toContain(term)
  }
})
