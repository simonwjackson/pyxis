import { describe, expect, test } from "vitest"
import type { OfflineMedia } from "./contract"
import { MIN_FREE_BYTES, selectEvictionOrder, storageIsPressured } from "./offline-policy"

function media(trackId: string, cachedAt: number, openedAt?: number): OfflineMedia {
  return {
    id: trackId,
    trackId,
    albumIds: [`album-${trackId}`],
    candidateId: `candidate-${trackId}`,
    candidateUrl: `https://pyxis.test/__pyxis/offline/${trackId}`,
    bytes: 1000,
    contentType: "audio/mpeg",
    cachedAt,
    ...(openedAt === undefined ? {} : { openedAt }),
  }
}

describe("storage pressure", () => {
  test("is calm without a usable estimate", () => {
    expect(storageIsPressured(undefined)).toBe(false)
    expect(storageIsPressured({})).toBe(false)
    expect(storageIsPressured({ usage: 10, quota: 0 })).toBe(false)
  })

  test("detects fill fraction and missing headroom", () => {
    const gibibyte = 1024 * 1024 * 1024
    expect(storageIsPressured({ usage: gibibyte / 2, quota: gibibyte })).toBe(false)
    expect(storageIsPressured({ usage: gibibyte * 0.9, quota: gibibyte })).toBe(true)
    expect(storageIsPressured({ usage: gibibyte - MIN_FREE_BYTES / 2, quota: gibibyte })).toBe(true)
  })
})

describe("offline eviction", () => {
  test("orders least recently opened first and keeps the newest", () => {
    expect(
      selectEvictionOrder(
        [media("old", 100), media("middle", 200, 500), media("fresh", 300, 900)],
        new Set(),
      ),
    ).toEqual(["old", "middle", "fresh"])
  })

  test("never offers retained tracks", () => {
    expect(
      selectEvictionOrder(
        [media("pinned", 100), media("old", 200), media("current", 300, 900)],
        new Set(["pinned"]),
      ),
    ).toEqual(["old", "current"])
  })

  test("uses opened time rather than download time", () => {
    expect(
      selectEvictionOrder(
        [media("replayed", 100, 950), media("never-opened", 800), media("current", 900, 1000)],
        new Set(),
      ),
    ).toEqual(["never-opened", "replayed", "current"])
  })
})
