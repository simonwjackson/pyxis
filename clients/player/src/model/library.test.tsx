import { describe, expect, it } from "vitest"
import { type RpcLibraryAlbum, RpcPlacement } from "../../../../contracts/generated/pyxis"
import { readAlbums } from "./album"
import { byRecentlyAdded, countLibrary, downloaded, inPlacement, readNotices } from "./library"
import { readOfflineOverview } from "./offline"

const album = (id: string, patch: Partial<RpcLibraryAlbum> = {}): RpcLibraryAlbum => ({
  id,
  title: id,
  artist: "HEALTH",
  placement: RpcPlacement.Collection,
  placementUpdatedAt: "2026-01-01T00:00:00Z",
  addedAt: "2026-01-01T00:00:00Z",
  revision: 1,
  tracks: [],
  ...patch,
})

describe("counts describe what is actually there", () => {
  it("counts downloaded albums by bytes present, not by what was requested", () => {
    const index = readOfflineOverview({
      available: true,
      totalBytes: 1,
      albums: [
        { albumId: "a", state: "ready", totalTracks: 1, readyTracks: 1, bytes: 1 },
        { albumId: "b", state: "downloading", totalTracks: 4, readyTracks: 1, bytes: 1 },
      ],
    })
    const albums = readAlbums([album("a"), album("b"), album("c")], index)
    const counts = countLibrary(albums)
    expect(counts.all).toBe(3)
    expect(counts.downloaded).toBe(1)
    expect(downloaded(albums).map((view) => view.id)).toEqual(["a"])
  })

  it("counts each placement separately", () => {
    const albums = readAlbums([
      album("a", { placement: RpcPlacement.Collection }),
      album("b", { placement: RpcPlacement.Discovery }),
      album("c", { placement: RpcPlacement.Archive }),
      album("d", { placement: RpcPlacement.Dismissed }),
    ])
    const counts = countLibrary(albums)
    expect(counts).toEqual({
      all: 4,
      downloaded: 0,
      collection: 1,
      discovery: 1,
      archive: 1,
    })
    expect(inPlacement(albums, "dismissed").map((view) => view.id)).toEqual(["d"])
  })

  it("reports zero for an empty library rather than refusing to answer", () => {
    expect(countLibrary([])).toEqual({
      all: 0,
      downloaded: 0,
      collection: 0,
      discovery: 0,
      archive: 0,
    })
  })
})

describe("ordering", () => {
  it("puts the most recently added album first without mutating the input", () => {
    const input = readAlbums([
      album("old", { addedAt: "2026-01-01T00:00:00Z" }),
      album("new", { addedAt: "2026-06-01T00:00:00Z" }),
    ])
    const sorted = byRecentlyAdded(input)
    expect(sorted.map((view) => view.id)).toEqual(["new", "old"])
    expect(input.map((view) => view.id)).toEqual(["old", "new"])
  })
})

describe("notices tell the person what happened to their own intent", () => {
  it("reads a conflict into the placements it kept and discarded", () => {
    const [notice] = readNotices([
      {
        id: "n1",
        kind: "conflict",
        albumId: "album-1",
        kept: RpcPlacement.Archive,
        discarded: RpcPlacement.Collection,
      },
    ])
    expect(notice).toEqual({
      kind: "conflict",
      id: "n1",
      albumId: "album-1",
      kept: "archive",
      discarded: "collection",
    })
  })

  it("preserves a removal verdict rather than mapping it to a placement", () => {
    const [notice] = readNotices([
      {
        id: "n2",
        kind: "conflict",
        albumId: "album-1",
        kept: "removed",
        discarded: RpcPlacement.Collection,
      },
    ])
    expect(notice?.kind === "conflict" && notice.kept).toBe("removed")
  })

  it("reads a dropped write with its reason", () => {
    expect(readNotices([{ id: "n3", kind: "dropped", writeId: "w1", reason: "rejected" }])).toEqual(
      [{ kind: "dropped", id: "n3", reason: "rejected" }],
    )
  })
})
