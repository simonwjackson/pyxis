import { tabId } from "./catalog-reads"
import { isRecord, plainRunTexts, walk } from "./renderers"
import type { createTransport } from "./transport"

interface Lyrics {
  lines: { text: string; startMs?: number }[]
  attribution?: string
}
function synced(data: unknown): Lyrics | undefined {
  let lyrics: Lyrics | undefined
  walk(data, (n) => {
    if (!Array.isArray(n.timedLyricsData)) return
    const lines: Lyrics["lines"] = []
    for (const row of n.timedLyricsData) {
      if (!isRecord(row) || typeof row.lyricLine !== "string" || !isRecord(row.cueRange)) return
      const raw = row.cueRange.startTimeMilliseconds
      if (typeof raw !== "number" && !(typeof raw === "string" && /^\d+$/.test(raw))) return
      const startMs = Number(raw)
      if (!Number.isSafeInteger(startMs) || startMs < 0 || startMs > 0xffffffff) return
      lines.push({ text: row.lyricLine, startMs })
    }
    if (lines.length)
      lyrics = {
        lines,
        ...(typeof n.sourceMessage === "string" && { attribution: n.sourceMessage }),
      }
  })
  return lyrics
}
function plain(data: unknown): Lyrics | undefined {
  let lyrics: Lyrics | undefined
  walk(data, (n) => {
    const shelf = n.musicDescriptionShelfRenderer
    if (!isRecord(shelf)) return
    const text = plainRunTexts(shelf.description).join("")
    if (!text.trim()) return
    const attribution = plainRunTexts(shelf.footer).join("")
    lyrics ??= {
      lines: text.split(/\r?\n/).map((text) => ({ text })),
      ...(attribution && { attribution }),
    }
  })
  return lyrics
}
export async function readLyrics(request: ReturnType<typeof createTransport>, id: string) {
  const browseId = tabId(await request("next", { videoId: id }), "MPLY")
  if (!browseId) return { status: "notFound" as const }
  let mobile: unknown
  try {
    mobile = await request("browse", { browseId }, true)
  } catch (error) {
    // A missing/unsupported mobile identity doesn't rule out WEB_REMIX lyrics. Don't
    // turn a rate limit or network failure into an immediate second upstream request.
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        (error.code === "ytmusic.http403" ||
          error.code === "ytmusic.http404" ||
          error.code === "ytmusic.http400")
      )
    )
      throw error
  }
  const lyrics = synced(mobile) ?? plain(mobile) ?? plain(await request("browse", { browseId }))
  return lyrics ? { status: "found" as const, value: lyrics } : { status: "notFound" as const }
}
