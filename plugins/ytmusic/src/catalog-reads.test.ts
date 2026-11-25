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

test("artist grid resumes with its URL token and original browse selectors", async () => {
  const grid = (await import("../fixtures/artist-grid.json")).default
  const api = (await import("./internal-api")).createYtMusicInternalApi((async (url, opts) => {
    const { context, ...body } = JSON.parse(String(opts?.body))
    const uri = new URL(String(url))
    if (!body.browseId && !body.continuation)
      return Response.json({ responseContext: { visitorData: "v" } })
    if (body.browseId === "artist") return Response.json(grid.artist)
    expect(body).toEqual({ browseId: "MPADUCr_iyUANcn9OX_yy9piYoLw", params: "ggMIegYIARoCAQI%3D" })
    const token = uri.searchParams.get("continuation")
    if (token) {
      expect(token).toBe("second-grid")
      expect(uri.searchParams.get("ctoken")).toBe(token)
      return Response.json(grid.second)
    }
    return Response.json(grid.first)
  }) as typeof fetch)
  const first = await api.discography("artist", 10)
  expect(first.items.map((r) => r.title)).toEqual(["A Moon Shaped Pool"])
  expect(first.cursor).toBeDefined()
  const second = await api.discography("artist", 10, first.cursor)
  expect(second.items.map((r) => r.title)).toEqual(["KID A MNESIA"])
  expect(second.items[0]?.externalId).not.toEqual(first.items[0]?.externalId)
  expect(second.cursor).toBeUndefined()
})
test("playlist track pages keep repeats in order but omit uploads", async () => {
  const [a, b, upload] = (await import("../fixtures/playlist-rows.json")).default
  const api = catalogReads(async () => ({
    musicPlaylistShelfRenderer: { contents: [a, upload, b, a] },
  }))
  const first = await api.playlistTracks("playlist", 2)
  const second = await api.playlistTracks("playlist", 2, first.cursor)
  expect([...first.items, ...second.items].map((row) => row.externalId)).toEqual([
    "3_R4ulvg8OY",
    "0VP_LezQ-QE",
    "3_R4ulvg8OY",
  ])
  expect(second.cursor).toBeUndefined()
})

test("related and credits follow only the endpoint offered for this recording", async () => {
  const song = (await import("../fixtures/song-pages.json")).default[0]
  const api = catalogReads(async (endpoint, body) => {
    if (endpoint === "next")
      return { tabRenderer: { endpoint: { browseEndpoint: { browseId: "MPTR-related" } } } }
    if (endpoint === "music/get_queue") return { browseEndpoint: { browseId: "MPTC-credits" } }
    if (body.browseId === "MPTR-related") return song
    expect(body.browseId).toBe("MPTC-credits")
    return {
      dismissableDialogContentSectionRenderer: {
        title: { runs: [{ text: "Written by" }] },
        subtitle: { runs: [{ text: "A" }, { text: ", " }, { text: "B" }] },
      },
    }
  })
  expect((await api.related("song", 1)).items.map((row) => row.title)).toEqual(["Die With A Smile"])
  expect(await api.credits("song")).toEqual([{ role: "Written by", names: ["A", "B"] }])
})
