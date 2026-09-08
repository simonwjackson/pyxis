import { describe, expect, it } from "vitest"
import {
  availabilityOf,
  isAwaitingBytes,
  type OfflineStatusRecord,
  offlineProgress,
  readOfflineOverview,
  readOfflineStatus,
} from "./offline"

const status = (patch: Partial<OfflineStatusRecord> = {}): OfflineStatusRecord => ({
  albumId: "album-1",
  state: "not-pinned",
  totalTracks: 10,
  readyTracks: 0,
  bytes: 0,
  ...patch,
})

describe("wanting media and having its bytes are separate facts", () => {
  it("reports an album asked for but not yet downloaded as wanted and absent", () => {
    const offline = readOfflineStatus(status({ state: "downloading", readyTracks: 3 }), true)
    expect(offline.intent).toBe("requested")
    expect(offline.bytes).toEqual({
      kind: "partial",
      readyTracks: 3,
      totalTracks: 10,
      bytes: 0,
    })
    expect(isAwaitingBytes(offline)).toBe(true)
    expect(availabilityOf(offline)).toBe("downloading")
  })

  it("does not call a partially downloaded album available", () => {
    const offline = readOfflineStatus(
      status({ state: "downloading", readyTracks: 9, totalTracks: 10 }),
      true,
    )
    expect(offline.bytes.kind).toBe("partial")
    expect(availabilityOf(offline)).not.toBe("available")
  })

  it("reports an album with every track present as available", () => {
    const offline = readOfflineStatus(
      status({ state: "ready", readyTracks: 10, totalTracks: 10, bytes: 812 }),
      true,
    )
    expect(offline.bytes).toEqual({ kind: "complete", tracks: 10, bytes: 812 })
    expect(availabilityOf(offline)).toBe("available")
    expect(isAwaitingBytes(offline)).toBe(false)
  })

  it("keeps intent after a failure and stops claiming a download is in flight", () => {
    const offline = readOfflineStatus(
      status({ state: "failed", readyTracks: 2, error: "no space" }),
      true,
    )
    expect(offline.intent).toBe("requested")
    expect(offline.failure).toBe("no space")
    expect(isAwaitingBytes(offline)).toBe(false)
    expect(availabilityOf(offline)).toBe("missing")
  })
})

describe("a device that cannot keep bytes never promises that it has", () => {
  it("refuses to report available when storage is unsupported, even with complete bytes", () => {
    const offline = readOfflineStatus(
      status({ state: "ready", readyTracks: 10, totalTracks: 10 }),
      false,
    )
    expect(offline.bytes.kind).toBe("complete")
    expect(availabilityOf(offline)).toBe("unknown")
  })
})

describe("not knowing is distinct from knowing the album is absent", () => {
  it("reports unknown when the offline overview has not been read", () => {
    expect(availabilityOf(undefined)).toBe("unknown")
  })

  it("reports missing once the overview is read and the album is not in it", () => {
    const overview = readOfflineOverview({ available: true, albums: [], totalBytes: 0 })
    expect(overview.size).toBe(0)
    expect(availabilityOf(overview.get("album-1"))).toBe("unknown")
    expect(availabilityOf(readOfflineStatus(undefined, true))).toBe("missing")
  })
})

describe("progress is only reported for albums somebody asked for", () => {
  it("returns nothing for an album nobody requested", () => {
    expect(offlineProgress(readOfflineStatus(status(), true))).toBeUndefined()
  })

  it("returns ready over total while downloading", () => {
    expect(
      offlineProgress(readOfflineStatus(status({ state: "downloading", readyTracks: 4 }), true)),
    ).toEqual({ ready: 4, total: 10 })
  })

  it("returns a complete ratio once every track is present", () => {
    expect(
      offlineProgress(
        readOfflineStatus(status({ state: "ready", readyTracks: 10, totalTracks: 10 }), true),
      ),
    ).toEqual({ ready: 10, total: 10 })
  })
})

describe("reading a whole overview", () => {
  it("indexes each album and carries device support onto every entry", () => {
    const index = readOfflineOverview({
      available: false,
      totalBytes: 5,
      albums: [
        status({ albumId: "a", state: "ready", readyTracks: 10, totalTracks: 10 }),
        status({ albumId: "b", state: "downloading", readyTracks: 1 }),
      ],
    })
    expect(index.get("a")?.supported).toBe(false)
    expect(index.get("b")?.supported).toBe(false)
    expect(availabilityOf(index.get("a"))).toBe("unknown")
  })
})
