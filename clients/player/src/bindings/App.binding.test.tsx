import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { type RpcLibraryAlbum, RpcPlacement } from "../../../../contracts/generated/pyxis"
import type { OfflineOverviewRecord } from "../model/offline"
import { App } from "./App.binding.tsx"
import type { LibraryEdge } from "./useLibrary.binding.tsx"

afterEach(cleanup)
beforeEach(() => window.history.replaceState(null, "", "/"))

const album = (id: string, title: string, addedAt: string): RpcLibraryAlbum => ({
  id,
  title,
  artist: "HEALTH",
  placement: RpcPlacement.Collection,
  placementUpdatedAt: "2026-01-01T00:00:00Z",
  addedAt,
  revision: 1,
  tracks: [],
})

const overview = (patch: Partial<OfflineOverviewRecord> = {}): OfflineOverviewRecord => ({
  available: true,
  albums: [],
  totalBytes: 0,
  ...patch,
})

const ALBUMS = [
  album("a", "GET COLOR", "2026-03-01T00:00:00Z"),
  album("b", "Spiderland", "2026-02-01T00:00:00Z"),
  album("c", "Loveless", "2026-01-01T00:00:00Z"),
]

/// Built once and reused, never rebuilt inside render. A fresh edge each render changes the
/// binding's dependency identity and restarts reconciliation without end.
const mount = (patch: Partial<LibraryEdge> = {}) => {
  const stable: LibraryEdge = {
    open: async () => ({}),
    albums: async () => ALBUMS,
    offlineOverview: async () => overview(),
    settings: async () => ({}),
    sync: async () => ({ offline: false, authRequired: false, deferred: 0 }),
    ...patch,
  }
  return render(<App edge={stable} />)
}

const barNode = () => screen.getByText("Nothing playing").closest(".px-bar")

describe("the persistent bar outlives navigation", () => {
  it("keeps the bar outside the part of the tree that navigation replaces", async () => {
    const { container } = mount()
    await screen.findByRole("heading", { name: "GET COLOR" })

    // Containment, not identity. Identity alone passes even with the bar nested inside the
    // outlet, because the frame itself never unmounts and React keeps the node — so that
    // assertion was true for a reason unrelated to the design. What actually has to hold is
    // that the bar is not in the subtree the router replaces.
    const outlet = container.querySelector(".px-frame-outlet")
    const bar = barNode()
    expect(outlet).not.toBeNull()
    expect(bar).not.toBeNull()
    expect(outlet?.contains(bar ?? null)).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: /^All albums/ }))
    await screen.findByRole("region", { name: "All albums, 3" })

    // And it is still the same element afterwards, which is what catches a bar rendered by
    // the page components themselves rather than by the frame.
    expect(barNode()).toBe(bar)
    expect(container.querySelector(".px-frame-outlet")?.contains(bar ?? null)).toBe(false)
  })

  it("replaces the surface and updates the address bar", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    expect(window.location.pathname).toBe("/")

    fireEvent.click(screen.getByRole("button", { name: /^All albums/ }))
    await screen.findByRole("region", { name: "All albums, 3" })

    expect(window.location.pathname).toBe("/library")
    // The lead belongs to Stacks; if it is still here the outlet did not actually swap.
    expect(screen.queryByRole("heading", { name: "GET COLOR" })).toBeNull()
  })

  it("follows the back button instead of drifting from the URL", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    fireEvent.click(screen.getByRole("button", { name: /^All albums/ }))
    await screen.findByRole("region", { name: "All albums, 3" })

    // jsdom's history.back() is asynchronous and unreliable to await, so the URL is moved
    // and the event the binding actually listens for is delivered directly.
    window.history.replaceState(null, "", "/")
    fireEvent.popState(window)

    await screen.findByRole("heading", { name: "GET COLOR" })
  })

  it("marks the surface the person is on", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    // Conveyed programmatically, not only by colour.
    expect(screen.getByRole("button", { name: "Stacks" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: /^All albums/ }).getAttribute("aria-pressed")).toBe(
      "false",
    )
  })
})

describe("the shell translates edge states into what the surface shows", () => {
  it("shows albums and no failure caption once a clean reconcile lands", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    expect(screen.queryByText("Not checked with your library yet")).toBeNull()
    // Most recently added leads; the rest fall to the shelf beneath it.
    expect(screen.getByRole("region", { name: "Recently added, 2" })).toBeDefined()
  })

  it("keeps the library on screen when the network stopped answering", async () => {
    mount({ sync: async () => ({ offline: true, authRequired: false, deferred: 0 }) })
    await screen.findByText("This device is offline. Showing what it already has.")
    // Still readable. Blanking here is the failure this whole model exists to prevent.
    expect(screen.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
  })

  it("asks the person to pair again rather than reporting a generic failure", async () => {
    mount({ sync: async () => ({ offline: false, authRequired: true, deferred: 0 }) })
    await screen.findByText("This device needs to be paired again before it can reconcile.")
  })

  it("says the library is empty and unconfirmed when both are true", async () => {
    mount({
      albums: async () => [],
      sync: async () => ({ offline: true, authRequired: false, deferred: 0 }),
    })
    await screen.findByText("No albums yet")
    expect(screen.getByText("This device is offline. Showing what it already has.")).toBeDefined()
  })

  it("reports an unreadable library as a failure with a retry", async () => {
    mount({
      albums: async () => {
        throw new Error("store refused")
      },
    })
    await screen.findByText("This library cannot be read here")
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined()
    // Nothing was ever read, so claiming emptiness would be an invention.
    expect(screen.queryByText("No albums yet")).toBeNull()
  })

  it("does not promise playback it cannot deliver", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    // Nothing in this client plays audio yet, so the bar says so and offers nothing.
    expect(screen.getByText("Nothing playing")).toBeDefined()
    expect(screen.queryByRole("button", { name: /^Resume/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull()
  })
})
