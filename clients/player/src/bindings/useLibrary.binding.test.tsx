import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type RpcLibraryAlbum, RpcPlacement } from "../../../../contracts/generated/pyxis"
import { shownValue } from "../model/edge"
import type { OfflineOverviewRecord } from "../model/offline"
import { type LibraryEdge, useLibrary } from "./useLibrary.binding"

const album = (id: string): RpcLibraryAlbum => ({
  id,
  title: id,
  artist: "HEALTH",
  placement: RpcPlacement.Collection,
  placementUpdatedAt: "2026-01-01T00:00:00Z",
  addedAt: "2026-01-01T00:00:00Z",
  revision: 1,
  tracks: [],
})

const overview = (patch: Partial<OfflineOverviewRecord> = {}): OfflineOverviewRecord => ({
  available: true,
  albums: [],
  totalBytes: 0,
  ...patch,
})

/// Built once per render, never inside the render callback. An edge rebuilt every render
/// changes identity, restarts reconciliation, and never settles.
const render = (patch: Partial<LibraryEdge> = {}) => {
  const stable: LibraryEdge = {
    open: async () => ({}),
    albums: async () => [album("a")],
    offlineOverview: async () => overview(),
    settings: async () => ({}),
    sync: async () => ({ offline: false, authRequired: false, deferred: 0 }),
    ...patch,
  }
  return renderHook(() => useLibrary(stable))
}

describe("the library is readable before the network answers", () => {
  it("shows local albums, then upgrades them to live after a clean reconcile", async () => {
    const { result } = render()
    await waitFor(() => {
      const state = result.current.albums
      expect(state.state === "ready" && state.freshness).toBe("live")
    })
    expect(shownValue(result.current.albums)?.map((view) => view.id)).toEqual(["a"])
  })

  it("keeps the local library visible when the network stopped answering", async () => {
    const { result } = render({
      sync: async () => ({ offline: true, authRequired: false, deferred: 2 }),
    })
    await waitFor(() => expect(result.current.albums.state).toBe("unavailable"))
    const state = result.current.albums
    expect(state.state === "unavailable" && state.reason).toEqual({ kind: "offline" })
    expect(shownValue(state)?.map((view) => view.id)).toEqual(["a"])
    expect(result.current.pendingWrites).toBe(2)
  })

  it("reports refused credentials so the person is asked to pair again", async () => {
    const { result } = render({
      sync: async () => ({ offline: false, authRequired: true, deferred: 0 }),
    })
    await waitFor(() => expect(result.current.albums.state).toBe("unavailable"))
    const state = result.current.albums
    expect(state.state === "unavailable" && state.reason).toEqual({ kind: "auth-required" })
  })

  it("distinguishes an empty library from not having asked", async () => {
    const { result } = render({ albums: async () => [] })
    await waitFor(() => expect(result.current.albums.state).toBe("ready"))
    expect(shownValue(result.current.albums)).toEqual([])
  })
})

describe("offline support is a property of the device, not a preference", () => {
  it("refuses to promise offline support on an ephemeral store", async () => {
    const { result } = render({ open: async () => ({ ephemeral: true }) })
    await waitFor(() => expect(result.current.albums.state).toBe("ready"))
    expect(result.current.offlineSupported).toBe(false)
  })

  it("refuses to promise offline support when the overview says it is unavailable", async () => {
    const { result } = render({ offlineOverview: async () => overview({ available: false }) })
    await waitFor(() => expect(result.current.albums.state).toBe("ready"))
    expect(result.current.offlineSupported).toBe(false)
  })

  it("reports support and retained bytes when the device can keep media", async () => {
    const { result } = render({ offlineOverview: async () => overview({ totalBytes: 4096 }) })
    await waitFor(() => expect(result.current.offlineSupported).toBe(true))
    expect(result.current.offlineBytes).toBe(4096)
  })
})

describe("a failure in one read does not become a failure of the screen", () => {
  it("still shows the library when the offline overview cannot be read", async () => {
    const { result } = render({
      offlineOverview: async () => {
        throw new Error("no storage")
      },
    })
    await waitFor(() => expect(result.current.albums.state).toBe("ready"))
    const [view] = shownValue(result.current.albums) ?? []
    // Unknown, not missing: the overview was never read, so nothing is known about bytes.
    expect(view?.availability).toBe("unknown")
  })

  it("reports a failure with nothing to show when the library itself cannot be read", async () => {
    const { result } = render({
      albums: async () => {
        throw new Error("database closed")
      },
    })
    await waitFor(() => expect(result.current.albums.state).toBe("unavailable"))
    expect(shownValue(result.current.albums)).toBeUndefined()
  })

  it("still shows the library when notices cannot be read", async () => {
    const { result } = render({
      settings: async () => {
        throw new Error("no settings")
      },
    })
    await waitFor(() => expect(result.current.albums.state).toBe("ready"))
    expect(result.current.notices).toEqual([])
  })

  it("reports a failure when the worker cannot be opened at all", async () => {
    const { result } = render({
      open: async () => {
        throw new Error("worker unavailable")
      },
    })
    await waitFor(() => expect(result.current.albums.state).toBe("unavailable"))
    expect(result.current.offlineSupported).toBe(false)
  })
})

describe("durable notices reach the screen", () => {
  it("reads a conflict notice into the placements it kept and discarded", async () => {
    const { result } = render({
      settings: async () => ({
        syncNotices: [
          {
            id: "n1",
            kind: "conflict" as const,
            albumId: "a",
            kept: RpcPlacement.Archive,
            discarded: RpcPlacement.Collection,
          },
        ],
      }),
    })
    await waitFor(() => expect(result.current.notices).toHaveLength(1))
    expect(result.current.notices[0]).toEqual({
      kind: "conflict",
      id: "n1",
      albumId: "a",
      kept: "archive",
      discarded: "collection",
    })
  })
})
