import { expect, test } from "bun:test"
import playlists from "../fixtures/search-playlists.json"
import { createYtMusicInternalApi } from "./internal-api"

test("exact filters reach search; suggestions resume at the next text", async () => {
  const filters: string[] = []
  const api = createYtMusicInternalApi((async (url, options) => {
    const body = JSON.parse(String(options?.body))
    if (String(url).includes("/search?")) {
      filters.push(body.params)
      return Response.json(playlists)
    }
    if (String(url).includes("/music/get_search_suggestions?")) {
      expect(body.input).toBe("weekend")
      return Response.json({
        searchSuggestionsSectionRenderer: {
          contents: ["weekend", "weekend update"].map((query) => ({
            searchSuggestionRenderer: { navigationEndpoint: { searchEndpoint: { query } } },
          })),
        },
      })
    }
    return Response.json({ responseContext: { visitorData: "visitor" } })
  }) as typeof fetch)
  await api.searchPlaylists("weekend", 1, false)
  await api.searchPlaylists("weekend", 1, true)
  expect(filters).toEqual([
    "EgeKAQQoAEABahAQAxAEEAkQChAFEBEQEBAV",
    "Eg-KAQwIABAAGAAgACgBMABCAggBagoQBBADEAkQBRAK",
  ])
  const first = await api.suggest("weekend", 1)
  expect(first.items).toEqual(["weekend"])
  expect(await api.suggest("weekend", 1, first.cursor)).toEqual({ items: ["weekend update"] })
})

test("track pages resume inside a shelf and then request its upstream continuation", async () => {
  const pages = (await import("../fixtures/song-pages.json")).default
  const requests: (string | null)[] = []
  const api = createYtMusicInternalApi((async (url, opts) => {
    const uri = new URL(String(url))
    if (!uri.pathname.endsWith("/search"))
      return Response.json({ responseContext: { visitorData: "v" } })
    const token = uri.searchParams.get("ctoken")
    requests.push(token)
    expect(JSON.parse(String(opts?.body)).query).toBe("recording")
    return Response.json(pages[token ? 1 : 0])
  }) as typeof fetch)
  const one = await api.searchSongs("recording", 2)
  const two = await api.searchSongs("recording", 2, false, one.cursor)
  const three = await api.searchSongs("recording", 2, false, two.cursor)
  expect(requests).toEqual([null, null, "page-two"])
  expect([...one.items, ...two.items, ...three.items].map((t) => t.externalId)).toEqual([
    "DlFXDl_ROAM",
    "_WfL_j6-DvM",
    "tXOKabXyR5Q",
    "1OZnXQQPBU0",
    "si-g77lVJ2E",
  ])
})
