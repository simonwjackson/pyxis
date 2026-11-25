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
