import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { ReferenceApp } from "./App.tsx"
import type { ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferenceSessions } from "./Sessions.tsx"

afterEach(cleanup)

function client(plugins: Awaited<ReturnType<ReferenceClient["listPlugins"]>>): ReferenceClient {
  return {
    claimDevice: async () => ({
      account: { id: "default", name: "default", isDefault: true, createdAt: "now" },
      device: { id: "device-1", name: "reference browser" },
      bearerToken: "token",
    }),
    listPlugins: async () => plugins,
    listAlbums: async () => [],
    setAlbumPlacement: async () => {
      throw new Error("not used")
    },
    search: async () => ({ tracks: [], noSources: plugins.length === 0, failures: [] }),
    listSessions: async () => [],
    createSession: async () => {
      throw new Error("not used")
    },
    command: async () => {
      throw new Error("not used")
    },
    appendListen: async () => {},
    loadStream: async () => "blob:test",
  }
}

describe("reference client", () => {
  test("explains the valid zero-plugin product state", async () => {
    render(<ReferenceApp client={client([])} />)

    await waitFor(() => expect(screen.getByText("Status: ready")).toBeTruthy())
    expect(
      screen.getByText(
        "No plugins installed. The core is running, but search and playback have no source.",
      ),
    ).toBeTruthy()
  })

  test("lists a live source plugin without adding visual interpretation", async () => {
    render(
      <ReferenceApp
        client={client([
          {
            id: "ytmusic",
            name: "YouTube Music",
            version: "1.0.0",
            capabilities: ["source"],
            status: "live",
            configured: true,
          },
        ])}
      />,
    )

    await waitFor(() => expect(screen.getByText(/YouTube Music \(ytmusic\)/)).toBeTruthy())
  })

  test("lists library albums and applies placement changes", async () => {
    let placement: RpcPlacement = RpcPlacement.Discovery
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => [
        {
          id: "album-1",
          title: "Heroes",
          artist: "David Bowie",
          placement: RpcPlacement.Discovery,
          placementUpdatedAt: "now",
          addedAt: "now",
          revision: 1,
          tracks: [],
        },
      ],
      setAlbumPlacement: async (_token, _albumId, next) => {
        placement = next
        return {
          id: "album-1",
          title: "Heroes",
          artist: "David Bowie",
          placement: next,
          placementUpdatedAt: "later",
          addedAt: "now",
          revision: 2,
          tracks: [],
        }
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))

    await waitFor(() => expect(placement).toBe(RpcPlacement.Collection))
    expect(screen.getByText(/collection — revision 2/)).toBeTruthy()
  })

  test("searches, queues, and loads audio through the reference binding", async () => {
    let session: Awaited<ReturnType<ReferenceClient["createSession"]>> | undefined
    let loadedTrack: string | undefined
    const configured: ReferenceClient = {
      claimDevice: async () => ({
        account: { id: "default", name: "default", isDefault: true, createdAt: "now" },
        device: { id: "device-1", name: "reference browser" },
        bearerToken: "token",
      }),
      listPlugins: async () => [
        {
          id: "ytmusic",
          name: "YouTube Music",
          version: "1.0.0",
          capabilities: ["source"],
          status: "live",
          configured: true,
        },
      ],
      listAlbums: async () => [],
      setAlbumPlacement: async () => {
        throw new Error("not used")
      },
      search: async () => ({
        noSources: false,
        failures: [],
        tracks: [
          {
            id: "track-1",
            title: "Heroes",
            artist: "David Bowie",
            sourcePluginId: "ytmusic",
          },
        ],
      }),
      listSessions: async () => [],
      createSession: async () => {
        session = {
          id: "session-1",
          name: "Reference browser",
          hostDeviceId: "device-1",
          queue: [],
          transport: "stopped",
          positionMs: 0,
          volume: 100,
          reachable: true,
          revision: 1,
          updatedAt: "now",
        }
        return session
      },
      command: async (_token, _sessionId, command) => {
        if (session === undefined) throw new Error("session missing")
        if (command._tag === "queue.add") {
          session = {
            ...session,
            queue: [...session.queue, ...command.payload.trackIds],
            cursor: 0,
            currentTrackId: command.payload.trackIds[0],
            streamPath: `/stream/${command.payload.trackIds[0]}`,
          }
        }
        if (command._tag === "transport.play") session = { ...session, transport: "playing" }
        return session
      },
      appendListen: async () => {},
      loadStream: async (_token, trackId) => {
        loadedTrack = trackId
        return "blob:test"
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
        <ReferenceSessions />
        <ReferenceConsole />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/Account: default/)).toBeTruthy())

    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "Bowie" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(screen.getByText(/Heroes — David Bowie/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Add to queue" }))
    await waitFor(() => expect(screen.getAllByText("track-1").length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getByRole("button", { name: "Play" }))

    await waitFor(() => expect(loadedTrack).toBe("track-1"))
  })
})
