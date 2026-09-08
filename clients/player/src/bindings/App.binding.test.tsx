import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type RpcLibraryAlbum,
  RpcPlacement,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import type { ClaimResult } from "../model/account"
import type { OfflineOverviewRecord } from "../model/offline"
import { App } from "./App.binding.tsx"
import type { AccountEdge } from "./useAccount.binding.tsx"
import type { LibraryEdge } from "./useLibrary.binding.tsx"
import type { PlaybackEdge } from "./usePlayback.binding.tsx"

afterEach(cleanup)
beforeEach(() => window.history.replaceState(null, "", "/"))

const album = (
  id: string,
  title: string,
  addedAt: string,
  tracks: readonly string[] = [`${id}-t1`, `${id}-t2`],
): RpcLibraryAlbum => ({
  id,
  title,
  artist: "HEALTH",
  placement: RpcPlacement.Collection,
  placementUpdatedAt: "2026-01-01T00:00:00Z",
  addedAt,
  revision: 1,
  tracks: tracks.map((trackId, index) => ({
    id: trackId,
    title: `Track ${index + 1}`,
    artist: "HEALTH",
    trackNumber: index + 1,
    revision: 1,
  })),
})

const GRANT: ClaimResult = {
  status: "granted",
  credential: {
    account: {
      id: "account-1",
      name: "Default",
      isDefault: true,
      createdAt: "2026-01-01T00:00:00Z",
    },
    device: { id: "device-1", name: "Chrome on Linux" },
    token: "token-1",
  },
}

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "This device",
  hostDeviceId: "device-1",
  queue: [],
  transport: RpcTransport.Stopped,
  positionMs: 0,
  volume: 50,
  reachable: true,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
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
const mount = (
  patch: Partial<LibraryEdge> = {},
  ports: {
    readonly account?: Partial<AccountEdge>
    readonly playback?: Partial<PlaybackEdge>
  } = {},
) => {
  const stable: LibraryEdge = {
    open: async () => ({}),
    albums: async () => ALBUMS,
    offlineOverview: async () => overview(),
    settings: async () => ({}),
    sync: async () => ({ offline: false, authRequired: false, deferred: 0 }),
    ...patch,
  }
  const account: AccountEdge = {
    open: async () => ({}),
    settings: async () => ({}),
    writeSettings: async (written) => written,
    claim: async () => GRANT,
    ...ports.account,
  }
  const playbackPort: PlaybackEdge = {
    sessions: async () => [],
    queueSessionCommand: async (current) => current,
    queueListen: async () => undefined,
    touchOfflineTrack: async () => undefined,
    syncSessions: async () => ({ offline: false, authRequired: false, deferred: 0 }),
    loadStream: async (trackId) => `blob:${trackId}`,
    ensureSession: async () => session(),
    ...ports.playback,
  }
  return render(
    <App
      edge={stable}
      accountEdge={account}
      playbackEdge={playbackPort}
      deviceName="Chrome on Linux"
    />,
  )
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

  it("says nothing is playing when no session is sounding", async () => {
    mount()
    await screen.findByRole("heading", { name: "GET COLOR" })
    // The client can play now, so the old form of this test -- asserting no Play control
    // exists anywhere -- would only be asserting that the feature is still missing. What
    // stays true is that the bar reports the session, and an empty session is silence.
    expect(screen.getByText("Nothing playing")).toBeDefined()
    expect(screen.queryByRole("button", { name: /^Resume/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull()
  })
})

describe("choosing an album", () => {
  it("queues that album's real track ids and then plays", async () => {
    const commands: RpcSessionCommand[] = []
    const ensureSession = vi.fn(async () => session())
    mount(
      {},
      {
        playback: {
          ensureSession,
          queueSessionCommand: async (current, command) => {
            commands.push(command)
            return current
          },
        },
      },
    )
    await screen.findByRole("heading", { name: "GET COLOR" })

    fireEvent.click(screen.getByRole("button", { name: "Play" }))

    await waitFor(() => expect(commands).toHaveLength(3))
    expect(ensureSession).toHaveBeenCalledTimes(1)
    // Cleared first, so choosing an album replaces what was queued rather than appending to
    // it. Someone who picks a record expects that record, not the last one with this after.
    expect(commands[0]?._tag).toBe("queue.clear")
    expect(commands[1]).toEqual({
      _tag: "queue.add",
      payload: { trackIds: ["a-t1", "a-t2"] },
    })
    expect(commands[2]?._tag).toBe("transport.play")
  })

  it("does not start a session for an album the core could not queue", async () => {
    const ensureSession = vi.fn(async () => session())
    mount(
      { albums: async () => [album("a", "GET COLOR", "2026-03-01T00:00:00Z", [])] },
      { playback: { ensureSession } },
    )
    await screen.findByRole("heading", { name: "GET COLOR" })

    fireEvent.click(screen.getByRole("button", { name: "Play" }))

    // An album with no tracks cannot be queued. Creating a session for it would leave a
    // device hosting an empty queue and reporting itself as a place music is playing.
    // Waited properly rather than for one microtask, so this fails if the guard is removed
    // instead of merely observing that the call had not happened yet.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(ensureSession).not.toHaveBeenCalled()
  })
})

describe("the credential gates the library", () => {
  it("does not read the library until the device holds a credential", async () => {
    const albums = vi.fn(async () => ALBUMS)
    let admit: (result: ClaimResult) => void = () => undefined
    const claimed = new Promise<ClaimResult>((resolve) => {
      admit = resolve
    })
    mount({ albums }, { account: { claim: async () => claimed } })

    // Long enough for an ungated read to have happened. A single microtask is not: the
    // library read is several awaits deep, so `await Promise.resolve()` here passed whether
    // the gate existed or not, and proved only that reading is asynchronous.
    await new Promise((resolve) => setTimeout(resolve, 50))
    // Reading before the credential is what produces `authRequired` from the worker and
    // makes the screen blame the person for a race this client started.
    expect(albums).not.toHaveBeenCalled()

    admit(GRANT)
    await screen.findByRole("heading", { name: "GET COLOR" })
    expect(albums).toHaveBeenCalled()
  })

  it("offers pairing instead of an empty library when the core refuses the device", async () => {
    const albums = vi.fn(async () => ALBUMS)
    mount({ albums }, { account: { claim: async () => ({ status: "pairingRequired" }) } })

    await screen.findByText("This device is not paired yet, so it cannot read your library.")
    expect(screen.getByRole("button", { name: "Pair this device" })).toBeDefined()
    // No shelves, no "no albums yet": an empty library would read as "your music is gone".
    expect(screen.queryByText("No albums yet")).toBeNull()
    expect(albums).not.toHaveBeenCalled()
  })
})
