import { expect, test } from "bun:test"
import fixture from "../fixtures/lyrics.json"
import { readLyrics } from "./lyrics"
import { highResolutionArtwork } from "./renderers"

test("mobile timed lyrics and plain fallback use the same line shape", async () => {
  const text = fixture.browse.musicDescriptionShelfRenderer.description.runs[0]?.text
  for (const synced of [true, false]) {
    const calls: string[] = []
    const answer = await readLyrics(async (endpoint, body, mobile) => {
      calls.push(mobile ? "mobile" : endpoint)
      if (endpoint === "next") return fixture.next
      expect(body.browseId).toBe(fixture.next.tabRenderer.endpoint.browseEndpoint.browseId)
      if (mobile)
        return synced
          ? {
              timedLyricsModel: {
                lyricsData: {
                  timedLyricsData: [
                    { lyricLine: text, cueRange: { startTimeMilliseconds: "923" } },
                  ],
                },
              },
            }
          : {}
      return fixture.browse
    }, "recording")
    expect(answer).toMatchObject({
      status: "found",
      value: { lines: [synced ? { text, startMs: 923 } : { text }] },
    })
    expect(calls).toEqual(synced ? ["next", "mobile"] : ["next", "mobile", "browse"])
    if (!synced && answer.status === "found") expect(answer.value.lines[0]?.startMs).toBeUndefined()
  }
})
test("no lyrics tab is an explicit miss without a browse", async () => {
  expect(
    await readLyrics(async (endpoint) => {
      expect(endpoint).toBe("next")
      return {}
    }, "recording"),
  ).toEqual({ status: "notFound" })
})
test("only size directives on image CDN paths are rewritten", () => {
  const url = "https://lh3.googleusercontent.com/art=w120-h120-l90-rj?x=w20"
  expect(highResolutionArtwork(url)).toBe(url.replace("w120-h120", "s0"))
  for (const host of ["lh3.googleusercontent.com.example.org", "i.ytimg.com", "images.test"]) {
    const other = url.replace("lh3.googleusercontent.com", host)
    expect(highResolutionArtwork(other)).toBe(other)
  }
})
