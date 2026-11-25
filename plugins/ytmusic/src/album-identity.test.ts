import { expect, test } from "bun:test"
import album from "../fixtures/album.json"
import { createYtMusicInternalApi } from "./internal-api"

test("the id found by search opens the same album, including its POST continuation", async () => {
  const mpre = "MPREb_Tr9YVfRfip1",
    olak =
      new URL(album.microformat.microformatDataRenderer.urlCanonical).searchParams.get("list") ?? ""
  const track = album.musicShelfRenderer.contents[0]?.musicResponsiveListItemRenderer
  if (!track) throw new Error("missing recording")
  let resumes = 0
  const api = createYtMusicInternalApi((async (url, options) => {
    const body = JSON.parse(String(options?.body))
    if (String(url).includes("/search?"))
      return Response.json({
        musicResponsiveListItemRenderer: {
          navigationEndpoint: { browseEndpoint: { browseId: mpre } },
          flexColumns: [
            album.musicResponsiveHeaderRenderer.title,
            album.musicResponsiveHeaderRenderer.straplineTextOne,
          ].map((text) => ({ musicResponsiveListItemFlexColumnRenderer: { text } })),
        },
      })
    if (body.browseId === `VL${olak}`)
      return Response.json({
        runs: [
          {
            navigationEndpoint: {
              browseEndpoint: {
                browseId: mpre,
                browseEndpointContextSupportedConfigs: {
                  browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" },
                },
              },
            },
          },
        ],
      })
    if (body.browseId === mpre)
      return Response.json({
        ...album,
        musicShelfRenderer: {
          contents: [
            ...album.musicShelfRenderer.contents,
            {
              continuationItemRenderer: {
                continuationEndpoint: { continuationCommand: { token: "next" } },
              },
            },
          ],
        },
      })
    if (body.continuation === "next") {
      resumes++
      return Response.json({
        onResponseReceivedActions: [
          {
            appendContinuationItemsAction: {
              continuationItems: [
                {
                  musicResponsiveListItemRenderer: {
                    ...track,
                    playlistItemData: { videoId: "second" },
                  },
                },
              ],
            },
          },
        ],
      })
    }
    return Response.json({ responseContext: { visitorData: "visitor" } })
  }) as typeof fetch)
  const [result] = await api.searchAlbums("17", 1)
  expect(result?.externalId).toBe(olak)
  const opened = await api.getAlbum(result?.externalId ?? "")
  expect(opened.externalId).toBe(olak)
  expect(opened.tracks[1]?.externalId).toBe("second")
  expect(resumes).toBe(1)
})
