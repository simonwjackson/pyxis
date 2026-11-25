import { afterAll, beforeAll, expect, test } from "bun:test"
import { z } from "zod"
import { RPC_CONTRACT_ID, RpcMatchDecision } from "../../../contracts/generated/pyxis"
import { startHarness } from "./harness"

let h: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  h = await startHarness({
    scopes: ["library:read", "library:write", "listen:read", "source:read", "session:read"],
  })
})
afterAll(async () => {
  await h?.close()
})
async function call(
  name: string,
  args: Record<string, unknown> = {},
  capabilities = {},
  inputResponses = {},
) {
  const response = await h.post(
    "tools/call",
    { name, arguments: args, inputResponses },
    { capabilities },
  )
  const body = z
    .object({
      result: z.object({
        resultType: z.string(),
        isError: z.boolean().optional(),
        content: z.array(z.unknown()).optional(),
        structuredContent: z.record(z.string(), z.unknown()).optional(),
        inputRequests: z.record(z.string(), z.unknown()).optional(),
      }),
    })
    .parse(await response.json())
  return body.result
}
async function seed(title: string) {
  return (
    await h.owner.call({
      _tag: "library.album.add",
      payload: { artist: "Test", title, tracks: [{ title: `${title} track`, artist: "Test" }] },
    })
  ).value
}

test("zero sources is not an empty success from a catalog", async () => {
  for (const [name, args] of [
    ["search.sources", { query: "missing" }],
    ["stations.list", {}],
  ] as const) {
    expect(await call(name, args)).toMatchObject({ structuredContent: { status: "noSources" } })
  }
})

test("a tag plan previews the exact album replacements and apply returns the same plan", async () => {
  const a = await seed("Plan 1"),
    b = await seed("Plan 2")
  const changes = [
    { albumId: a.id, tags: [" MIX ", "jazz", "mix"] },
    { albumId: b.id, tags: ["late"] },
  ]
  const preview = await call("organizer.tags.preview", { changes })
  expect(preview.structuredContent).toMatchObject({
    changes: [
      { albumId: a.id, before: [], after: ["jazz", "mix"] },
      { albumId: b.id, before: [], after: ["late"] },
    ],
  })
  expect(await call("library.album", { albumId: a.id })).toMatchObject({
    structuredContent: { value: { tags: [] } },
  })
  const applied = await call("organizer.tags.apply", { changes })
  expect(applied.structuredContent).toEqual(preview.structuredContent)
  for (const [albumId, tags] of [
    [a.id, ["jazz", "mix"]],
    [b.id, ["late"]],
  ] as const) {
    expect(await call("library.album", { albumId })).toMatchObject({
      structuredContent: { value: { tags } },
    })
  }
})

test("bulk tag confirmation binds the exact changes; refusal does not write, unsupported clients proceed", async () => {
  const a = await seed("Bulk A"),
    b = await seed("Bulk B")
  const args = { albumIds: [a.id, b.id], tags: ["confirmed"] },
    form = { elicitation: { form: {} } }
  const question = await call("library.tags.bulk", args, form)
  const [key] = Object.keys(question.inputRequests ?? {})
  if (!key) throw Error("missing confirmation")
  const yes = { [key]: { action: "accept", content: { confirm: true } } }
  expect(await call("library.tags.bulk", { ...args, tags: ["changed"] }, form, yes)).toMatchObject({
    resultType: "input_required",
  })
  await call("library.tags.bulk", args, form, { [key]: { action: "decline" } })
  expect(await call("library.album", { albumId: a.id })).toMatchObject({
    structuredContent: { value: { tags: [] } },
  })
  expect(await call("library.tags.bulk", args, form, yes)).toMatchObject({
    structuredContent: { status: "ready" },
  })
  expect(await call("library.tags.bulk", { ...args, tags: [] })).toMatchObject({
    structuredContent: {
      changes: [
        { before: ["confirmed"], after: [] },
        { before: ["confirmed"], after: [] },
      ],
    },
  })
})

test("shelves save, select by nested tags, follow edits, check revisions and remove", async () => {
  const album = await seed("Shelf")
  await call("library.tags.set", { albumId: album.id, tags: ["night"] })
  const definition = {
    name: "Night",
    sort: "artist",
    tagExpression: {
      op: "and",
      value: [
        { op: "tag", value: "night" },
        { op: "not", value: { op: "tag", value: "skip" } },
      ],
    },
  }
  const saved = await call("shelves.save", definition)
  const { id: shelfId, revision: expectedRevision } = z
    .object({ id: z.string(), revision: z.number() })
    .parse(saved.structuredContent?.value)
  expect(await call("shelves.list")).toMatchObject({
    structuredContent: {
      value: expect.arrayContaining([expect.objectContaining({ id: shelfId })]),
    },
  })
  expect(await call("shelves.albums", { shelfId })).toMatchObject({
    structuredContent: { value: { albums: [{ id: album.id }] } },
  })
  await call("library.tags.set", { albumId: album.id, tags: ["night", "skip"] })
  expect(await call("shelves.albums", { shelfId })).toMatchObject({
    structuredContent: { value: { albums: [] } },
  })
  expect(
    await call("shelves.save", { ...definition, shelfId, expectedRevision, name: "Evening" }),
  ).toMatchObject({ structuredContent: { status: "ready", value: { revision: 2 } } })
  expect(await call("shelves.remove", { shelfId, expectedRevision })).toMatchObject({
    structuredContent: { status: "conflict", value: 2 },
  })
  expect(await call("shelves.remove", { shelfId, expectedRevision: 2 })).toMatchObject({
    structuredContent: { status: "removed" },
  })
  expect(await call("shelves.albums", { shelfId })).toMatchObject({
    structuredContent: { status: "unknown" },
  })
})

test("history counts track plays, associates missing album IDs and respects range edges", async () => {
  const first = await seed("History A"),
    second = await seed("History B")
  const trackId = first.tracks[0]?.id,
    secondId = second.tracks[0]?.id
  if (!trackId || !secondId) throw Error("missing seed track")
  const instants = ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z"]
  await h.owner.call({
    _tag: "listen.events.append",
    payload: {
      events: instants.map((listenedAt, i) => ({
        id: `01KH49HEV83YS7GQ4SQRMMC1M${i}`,
        trackId: i === 2 ? secondId : trackId,
        deviceId: h.device.device.id,
        listenedAt,
        completed: true,
        context: "library",
      })),
    },
  })
  expect(await call("history.recent", { limit: 1 })).toMatchObject({
    structuredContent: { events: [{ trackId: secondId }] },
  })
  expect(await call("history.range", { from: instants[0], to: instants[1] })).toMatchObject({
    structuredContent: { events: [{ trackId }] },
  })
  expect(await call("history.top")).toMatchObject({
    structuredContent: {
      albums: [
        { albumId: first.id, plays: 2 },
        { albumId: second.id, plays: 1 },
      ],
    },
  })
  const neglected = await call("history.neglected", { before: instants[2] })
  expect(neglected.structuredContent?.albums).toContainEqual(
    expect.objectContaining({ albumId: first.id, lastPlayedAt: instants[1] }),
  )
  expect(neglected.structuredContent?.albums).not.toContainEqual(
    expect.objectContaining({ albumId: second.id }),
  )
})

test("artwork is fetched only from a configured origin, without the Pyxis bearer or redirect following", async () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlB4AAAAASUVORK5CYII=",
    "base64",
  )
  const requests: (string | null)[] = []
  const covers = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push(request.headers.get("authorization"))
      if (new URL(request.url).pathname === "/redirect")
        return Response.redirect(new URL("/image", request.url))
      return new Response(bytes, { headers: { "content-type": "image/png" } })
    },
  })
  const previous = process.env.PYXIS_MCP_ARTWORK_ORIGINS
  try {
    async function seedUrl(path: string) {
      return (
        await h.owner.call({
          _tag: "library.album.add",
          payload: {
            artist: "Cover Artist",
            title: path,
            artworkUrl: new URL(path, covers.url).href,
            tracks: [],
          },
        })
      ).value.id
    }
    const albumId = await seedUrl("/image")
    delete process.env.PYXIS_MCP_ARTWORK_ORIGINS
    expect(await call("library.artwork", { albumId })).toMatchObject({
      isError: true,
      structuredContent: { code: "artwork.originRefused" },
    })
    expect(requests).toEqual([])
    process.env.PYXIS_MCP_ARTWORK_ORIGINS = covers.url.origin
    expect(await call("library.artwork", { albumId })).toMatchObject({
      content: [{ type: "image", mimeType: "image/png", data: bytes.toString("base64") }],
    })
    expect(await call("library.artwork", { albumId: await seedUrl("/redirect") })).toMatchObject({
      isError: true,
      structuredContent: { code: "artwork.unavailable" },
    })
    const uri = `pyxis://artwork/${albumId}`
    expect(await (await h.post("resources/read", { uri })).json()).toMatchObject({
      result: {
        cacheScope: "private",
        ttlMs: 30000,
        contents: [{ uri, mimeType: "image/png", blob: bytes.toString("base64") }],
      },
    })
    expect(requests).toEqual([null, null, null])
  } finally {
    if (previous === undefined) delete process.env.PYXIS_MCP_ARTWORK_ORIGINS
    else process.env.PYXIS_MCP_ARTWORK_ORIGINS = previous
    await covers.stop(true)
  }
})

test("browse tools use the query snapshot for continuations and expose tag counts", async () => {
  const a = await seed("Browse A"),
    b = await seed("Browse B")
  await call("library.tags.bulk", { albumIds: [a.id, b.id], tags: ["browse"] })
  const result = await call("library.search", { text: "Browse", limit: 1 })
  const page = z
    .object({ albums: z.array(z.object({ id: z.string() })), cursor: z.string() })
    .parse(result.structuredContent?.value)
  const next = await call("library.albums", { cursor: page.cursor })
  expect(next.structuredContent?.value).toMatchObject({
    albums: [{ id: page.albums[0]?.id === a.id ? b.id : a.id }],
  })
  for (const [name, args] of [
    ["library.byTag", { tag: "browse" }],
    ["library.artist", { artist: "Test" }],
    ["library.recentlyAdded", {}],
  ] as const) {
    expect((await call(name, args)).structuredContent?.value).toMatchObject({
      albums: expect.arrayContaining([
        expect.objectContaining({ id: a.id }),
        expect.objectContaining({ id: b.id }),
      ]),
    })
  }
  expect((await call("library.tags")).structuredContent?.tags).toContainEqual({
    tag: "browse",
    count: 2,
  })
  const invalidPlan = {
    changes: [
      { albumId: a.id, tags: ["replaced"] },
      { albumId: "missing", tags: [] },
    ],
  }
  expect(await call("organizer.tags.apply", invalidPlan)).toMatchObject({ isError: true })
  expect(await call("library.album", { albumId: a.id })).toMatchObject({
    structuredContent: { value: { tags: ["browse"] } },
  })
})

test("bookmarks and ordered, retry-safe playlist appends round trip", async () => {
  const album = await seed("Playlist album")
  const trackId = album.tracks[0]?.id
  if (!trackId) throw Error("missing track")
  expect(await call("bookmarks.add", { trackId })).toMatchObject({
    structuredContent: { status: "added" },
  })
  expect(await call("bookmarks.list")).toMatchObject({
    structuredContent: { value: [{ trackId }] },
  })
  expect(await call("bookmarks.remove", { trackId })).toMatchObject({
    structuredContent: { status: "removed" },
  })
  const created = await call("playlists.create", { title: "Test playlist", trackIds: [] })
  const { id: playlistId } = z.object({ id: z.string() }).parse(created.structuredContent?.value)
  const trackIds = [trackId, trackId],
    args = { playlistId, trackIds, commandId: "append-once" }
  for (let n = 0; n < 2; n++)
    expect(await call("playlists.append", args)).toMatchObject({
      structuredContent: { status: "applied", value: { trackIds } },
    })
  expect(await call("playlists.list")).toMatchObject({
    structuredContent: { value: [{ id: playlistId, trackIds }] },
  })
})

test("wrong song records a split for the observed playing track, never for stale now-playing input", async () => {
  const album = await seed("Matching")
  const currentTrackId = album.tracks[0]?.id
  if (!currentTrackId) throw Error("missing track")
  const wsUrl = new URL("/realtime", h.baseUrl)
  wsUrl.protocol = "ws:"
  const ws = new WebSocket(wsUrl)
  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            _tag: "realtime.hello",
            payload: { contractId: RPC_CONTRACT_ID, bearerToken: h.device.bearerToken, topics: [] },
          }),
        )
      ws.onerror = () => reject(Error("Could not connect test host"))
      ws.onmessage = (e) => {
        if (JSON.parse(e.data)._tag === "realtime.welcome") resolve()
        else reject(Error("No realtime welcome"))
      }
    })
    const created = await h.owner.call({
      _tag: "session.create",
      payload: { name: "Test device session" },
    })
    if (created.status !== "ready") throw Error(created.status)
    const sessionId = created.value.id
    const otherId = "candidate-B",
      args = { sessionId, currentTrackId, otherId }
    expect(await call("matching.wrongSong", args)).toMatchObject({
      structuredContent: { status: "notNowPlaying" },
    })
    for (const command of [
      { _tag: "queue.add" as const, payload: { trackIds: [currentTrackId] } },
      { _tag: "transport.play" as const, payload: {} },
    ]) {
      const result = await h.owner.call({
        _tag: "session.command.run",
        payload: { sessionId, command },
      })
      expect(result.status).toBe("applied")
    }
    expect(await call("matching.wrongSong", { ...args, currentTrackId: "stale" })).toMatchObject({
      structuredContent: { status: "notNowPlaying" },
    })
    expect(await call("matching.wrongSong", args)).toMatchObject({
      structuredContent: { status: "succeeded" },
    })
    const item = { artist: "Test", title: "Matching track" }
    const result = await h.owner.call({
      _tag: "matching.evaluate",
      payload: { left: { id: currentTrackId, ...item }, right: { id: otherId, ...item } },
    })
    expect(result.value.decision).toBe(RpcMatchDecision.ManualSplit)
  } finally {
    ws.close()
  }
})
