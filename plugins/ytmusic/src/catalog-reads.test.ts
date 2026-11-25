import { expect, test } from "bun:test"
import track from "../fixtures/queue-track.json"
import singles from "../fixtures/singles.json"
import { catalogReads } from "./catalog-reads"

test("a singles-only artist pages canonical releases without top songs", async () => {
  const api = catalogReads(async () => singles)
  const first = await api.discography("artist", 1)
  expect(first.items).toHaveLength(1)
  expect(first.items[0]).toMatchObject({ artist: "Hatsune Miku", releaseType: "single" })
  expect(first.items[0]?.externalId).toStartWith("OLAK5uy_")
  const second = await api.discography("artist", 1, first.cursor)
  expect(second.items[0]?.externalId).not.toBe(first.items[0]?.externalId)
  expect(second.cursor).toBeUndefined()
})
test("one batch song lookup accepts direct and wrapped primary renderers", async () => {
  for (const content of [
    track,
    { playlistPanelVideoWrapperRenderer: { primaryRenderer: track } },
  ]) {
    const api = catalogReads(async (endpoint, body) => {
      expect(endpoint).toBe("music/get_queue")
      expect(body.videoIds).toEqual(["missing", track.playlistPanelVideoRenderer.videoId])
      return { queueDatas: [{ content }] }
    })
    const rows = await api.details(["missing", track.playlistPanelVideoRenderer.videoId])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.artist).toBe("The Weeknd")
  }
})
test("absent related and credit endpoints make no fabricated browse requests", async () => {
  const api = catalogReads(async (endpoint) => {
    expect(endpoint).not.toBe("browse")
    return track
  })
  expect(await api.related("song", 5)).toEqual({ items: [] })
  expect(await api.credits("song")).toEqual([])
})

test("playlist track continuations are POST bodies and do not read a second page eagerly", async () => {
  const album = (await import("../fixtures/album.json")).default
  const rows = album.musicShelfRenderer.contents
  const api = catalogReads(async (endpoint, body) => {
    expect(endpoint).toBe("browse")
    if (body.browseId === "VLsource-playlist")
      return {
        musicPlaylistShelfRenderer: {
          contents: [
            ...rows,
            {
              continuationItemRenderer: {
                continuationEndpoint: { continuationCommand: { token: "issued" } },
              },
            },
          ],
        },
      }
    expect(body).toEqual({ continuation: "issued" })
    return {
      onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: rows } }],
    }
  })
  const first = await api.playlistTracks("source-playlist", 5)
  expect(first.cursor).toBeDefined()
  expect((await api.playlistTracks("source-playlist", 5, first.cursor)).cursor).toBeUndefined()
})
