import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { startHarness } from "./harness"

let h: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  h = await startHarness({
    scopes: ["source:read", "library:read", "library:write"],
    async prepareState(dir) {
      const plugins = join(dir, "plugins")
      await mkdir(plugins, { recursive: true })
      const fixture = new URL("./library/source-fixture.ts", import.meta.url).href
      await writeFile(
        join(plugins, "pyxis-plugin-catalog"),
        `#!${process.execPath}\nimport ${JSON.stringify(fixture)}\n`,
        { mode: 0o700 },
      )
    },
  })
})
afterAll(async () => {
  await h?.close()
})
async function call(name: string, args: Record<string, unknown> = {}) {
  return (await h.post("tools/call", { name, arguments: args })).json()
}

test("station capture saves the source album with registered track IDs; search membership follows the add", async () => {
  expect(await call("stations.list")).toMatchObject({
    result: { structuredContent: { value: { stations: [{ externalId: "station-ref" }] } } },
  })
  const batch = await h.owner.call({
    _tag: "source.station.next",
    payload: { pluginId: "catalog", stationId: "station-ref" },
  })
  if (batch.status !== "ready") throw Error(batch.status)
  const [track] = batch.value.tracks
  if (!track?.albumExternalId) throw Error("No album reference")
  const capture = {
    trackId: track.id,
    pluginId: track.sourcePluginId,
    albumExternalId: track.albumExternalId,
  }
  expect(await call("stations.capture", { ...capture, trackId: "wrong" })).toMatchObject({
    result: { isError: true },
  })
  expect(
    await call("stations.capture", { trackId: track.id, pluginId: track.sourcePluginId }),
  ).toMatchObject({
    result: {
      structuredContent: {
        status: "albumReferenceRequired",
        track: { albumTitle: "Station Album" },
      },
    },
  })
  const search = (inLibrary: boolean) => ({
    result: {
      structuredContent: {
        value: {
          tracks: [{ id: track.id, inLibrary }],
          albums: [{ inLibrary }],
          artists: [{ inLibrary }],
          failures: [],
        },
      },
    },
  })
  expect(await call("search.sources", { query: "Station" })).toMatchObject(search(false))
  const album = { title: "Station Album", tracks: [{ id: track.id, trackNumber: 1 }] }
  expect(await call("stations.capture", capture)).toMatchObject({
    result: { structuredContent: { value: album } },
  })
  expect(await call("search.sources", { query: "Station" })).toMatchObject(search(true))
  expect(await call("search.albums", { query: "Station", pluginId: "catalog" })).toMatchObject({
    result: { structuredContent: { value: [{ inLibrary: true }] } },
  })
  expect(
    await call("library.album.add", { externalId: capture.albumExternalId, pluginId: "catalog" }),
  ).toMatchObject({ result: { structuredContent: { value: album } } })
  expect(await call("organizer.snapshot")).toMatchObject({
    result: { structuredContent: { albums: [album] } },
  })
})

test("source artist releases and related songs are read-only tools", async () => {
  expect(
    await call("artist.discography", { pluginId: "catalog", externalId: "artist-ref" }),
  ).toMatchObject({
    result: { structuredContent: { value: { items: [{ externalId: "album-ref" }] } } },
  })
  expect(
    await call("search.related", { pluginId: "catalog", externalId: "track-ref" }),
  ).toMatchObject({
    result: { structuredContent: { value: { items: [{ externalId: "track-ref" }] } } },
  })
})
