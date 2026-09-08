import { describe, expect, it } from "vitest"
import {
  type RpcLibraryAlbum,
  type RpcLibraryTrack,
  RpcPlacement,
} from "../../../../contracts/generated/pyxis"
import { readAlbum, readAlbums, readPlacement } from "./album"
import { readOfflineOverview } from "./offline"

const track = (patch: Partial<RpcLibraryTrack> = {}): RpcLibraryTrack => ({
  id: "track-1",
  title: "Die Slow",
  artist: "HEALTH",
  revision: 1,
  ...patch,
})

const album = (patch: Partial<RpcLibraryAlbum> = {}): RpcLibraryAlbum => ({
  id: "album-1",
  title: "GET COLOR",
  artist: "HEALTH",
  placement: RpcPlacement.Collection,
  placementUpdatedAt: "2026-01-01T00:00:00Z",
  addedAt: "2026-01-01T00:00:00Z",
  revision: 1,
  tracks: [],
  ...patch,
})

describe("placement is carried across exactly", () => {
  it("maps every placement the core defines", () => {
    expect(readPlacement(RpcPlacement.Discovery)).toBe("discovery")
    expect(readPlacement(RpcPlacement.Collection)).toBe("collection")
    expect(readPlacement(RpcPlacement.Archive)).toBe("archive")
    expect(readPlacement(RpcPlacement.Dismissed)).toBe("dismissed")
  })
})

describe("running time is only reported when it is actually known", () => {
  it("sums durations when every track reports one", () => {
    const view = readAlbum(
      album({
        tracks: [track({ id: "a", durationMs: 1000 }), track({ id: "b", durationMs: 2000 })],
      }),
    )
    expect(view.durationMs).toBe(3000)
    expect(view.trackCount).toBe(2)
  })

  it("reports nothing rather than a wrong total when a track has no duration", () => {
    const view = readAlbum(
      album({ tracks: [track({ id: "a", durationMs: 1000 }), track({ id: "b" })] }),
    )
    expect(view.durationMs).toBeUndefined()
    expect(view.trackCount).toBe(2)
  })

  it("reports nothing for an album with no tracks", () => {
    expect(readAlbum(album()).durationMs).toBeUndefined()
  })
})

describe("offline facts reach the album view without being invented", () => {
  it("reports unknown availability when no overview was read", () => {
    const view = readAlbum(album())
    expect(view.offline).toBeUndefined()
    expect(view.availability).toBe("unknown")
  })

  it("reports available only when the bytes are all present", () => {
    const index = readOfflineOverview({
      available: true,
      totalBytes: 10,
      albums: [
        {
          albumId: "album-1",
          state: "ready",
          totalTracks: 1,
          readyTracks: 1,
          bytes: 10,
        },
      ],
    })
    const [view] = readAlbums([album({ tracks: [track()] })], index)
    expect(view?.availability).toBe("available")
    expect(view?.offline?.intent).toBe("requested")
  })

  it("leaves albums absent from the overview reporting unknown, not missing", () => {
    const index = readOfflineOverview({ available: true, totalBytes: 0, albums: [] })
    const [view] = readAlbums([album()], index)
    expect(view?.availability).toBe("unknown")
  })
})

describe("optional fields are omitted rather than set to undefined", () => {
  it("omits year and artwork when the core did not supply them", () => {
    const view = readAlbum(album())
    expect(Object.hasOwn(view, "year")).toBe(false)
    expect(Object.hasOwn(view, "artworkUrl")).toBe(false)
  })

  it("carries year and artwork when present", () => {
    const view = readAlbum(album({ year: 2009, artworkUrl: "/artwork/album-1" }))
    expect(view.year).toBe(2009)
    expect(view.artworkUrl).toBe("/artwork/album-1")
  })
})
