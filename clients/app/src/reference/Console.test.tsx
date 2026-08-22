import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import {
  RpcPlacement,
  type RpcSession,
  type RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import { createDirectWorkerClient } from "../worker/client.ts"
import { ReferenceApp } from "./App.tsx"
import type { ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferenceOffline } from "./Offline.tsx"
import { ReferenceAudio } from "./ReferenceAudio.tsx"
import { ReferenceRemote } from "./Remote.tsx"
import { ReferenceSessions } from "./Sessions.tsx"

function session(overrides: Partial<RpcSession> = {}): RpcSession {
  return {
    id: "session-remote",
    name: "Kitchen",
    hostDeviceId: "device-2",
    queue: [],
    transport: "stopped",
    positionMs: 0,
    volume: 100,
    reachable: true,
    revision: 1,
    updatedAt: "now",
    ...overrides,
  } as RpcSession
}

afterEach(cleanup)

// jsdom has no media stack. Give the element just enough behaviour to assert against.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: () => Promise.resolve(),
})
Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: () => {},
})

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
    sendCommand: async () => {
      throw new Error("not used")
    },
    handoff: async () => {
      throw new Error("not used")
    },
    connectRealtime: () => () => {},
    appendListen: async () => {},
    loadStream: async () => "blob:test",
  }
}

describe("local store", () => {
  test("opens at boot and reports what it kept", async () => {
    const store = createDirectWorkerClient()
    for (const id of ["album-1", "album-2"]) {
      await store.putAlbum({
        id,
        title: "Heroes",
        artist: "David Bowie",
        placement: RpcPlacement.Discovery,
        placementUpdatedAt: "now",
        addedAt: "now",
        revision: 1,
        tracks: [],
      })
    }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText("created")).toBeTruthy())
    expect(screen.getByText("2")).toBeTruthy()
    // An in-process store must not claim to keep anything.
    expect(screen.getByText("false")).toBeTruthy()
  })

  test("a network failure at boot still leaves the local store usable", async () => {
    const offline: ReferenceClient = {
      ...client([]),
      claimDevice: async () => {
        throw new Error("offline")
      },
    }

    render(
      <ReferenceApp client={offline} worker={createDirectWorkerClient()}>
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText("created")).toBeTruthy())
  })
})

describe("console mode", () => {
  test("drives a session hosted by another device", async () => {
    const sent: string[] = []
    const configured: ReferenceClient = {
      ...client([]),
      listSessions: async () => [session()],
      sendCommand: async (_token, sessionId, command) => {
        sent.push(`${sessionId}:${command._tag}`)
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceRemote />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/Kitchen/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "pause" }))
    await waitFor(() => expect(sent).toEqual(["session-remote:transport.pause"]))
  })

  test("shows only devices that can answer a command", async () => {
    const configured: ReferenceClient = {
      ...client([]),
      listSessions: async () => [],
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceRemote />
      </ReferenceApp>,
    )

    await waitFor(() =>
      expect(
        screen.getByText(
          "No other device is connected. Open this page on a second device to control it.",
        ),
      ).toBeTruthy(),
    )
  })

  test("resuming after a pause does not reload the track", async () => {
    const loads: string[] = []
    let transport: RpcSession["transport"] = "stopped"
    const configured: ReferenceClient = {
      ...client([]),
      listSessions: async () => [
        session({
          id: "mine",
          hostDeviceId: "device-1",
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
        }),
      ],
      command: async (_token, _sessionId, command) => {
        if (command._tag === "transport.play") transport = "playing"
        if (command._tag === "transport.pause") transport = "paused"
        return session({
          id: "mine",
          hostDeviceId: "device-1",
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          transport,
        })
      },
      loadStream: async (_token, trackId) => {
        loads.push(trackId)
        return `blob:${trackId}`
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceConsole />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    await waitFor(() => expect(loads).toEqual(["track-1"]))
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    await waitFor(() => expect(transport).toBe("paused"))
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    await waitFor(() => expect(transport).toBe("playing"))

    expect(loads).toEqual(["track-1"])
  })

  test("reports the paused position and resumes there after a reload", async () => {
    const commands: { tag: string; positionMs?: number }[] = []
    let transport: RpcSession["transport"] = "playing"
    let positionMs = 0
    const configured: ReferenceClient = {
      ...client([]),
      listSessions: async () => [
        session({
          id: "mine",
          hostDeviceId: "device-1",
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          transport: "playing",
          positionMs: 45_000,
        }),
      ],
      command: async (_token, _sessionId, command) => {
        commands.push({
          tag: command._tag,
          ...(command._tag === "position.report" ? { positionMs: command.payload.positionMs } : {}),
        })
        if (command._tag === "transport.pause") transport = "paused"
        if (command._tag === "position.report") positionMs = command.payload.positionMs
        return session({
          id: "mine",
          hostDeviceId: "device-1",
          queue: ["track-1"],
          cursor: 0,
          currentTrackId: "track-1",
          transport,
          positionMs,
          revision: commands.length + 1,
        })
      },
      loadStream: async () => "blob:track-1",
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceConsole />
        <ReferenceAudio />
      </ReferenceApp>,
    )

    // The session is already playing, so the host loads and seeks to where it was.
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })
    await waitFor(() => expect(Math.round(audio.currentTime)).toBe(45))

    audio.currentTime = 61
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))

    await waitFor(() =>
      expect(commands).toEqual([
        { tag: "transport.pause" },
        { tag: "position.report", positionMs: 61_000 },
      ]),
    )
  })

  test("queues a whole library album in one command", async () => {
    const queued: string[][] = []
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
          tracks: [
            { id: "track-1", title: "Beauty", artist: "David Bowie", trackNumber: 1, revision: 1 },
            { id: "track-2", title: "Heroes", artist: "David Bowie", trackNumber: 2, revision: 1 },
          ],
        },
      ],
      createSession: async () => session({ id: "mine", hostDeviceId: "device-1" }),
      command: async (_token, _sessionId, command) => {
        if (command._tag === "queue.add") queued.push(command.payload.trackIds)
        return session({ id: "mine", hostDeviceId: "device-1" })
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Queue album" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Queue album" }))

    await waitFor(() => expect(queued).toEqual([["track-1", "track-2"]]))
  })

  test("refetches instead of patching when the server dropped missed events", async () => {
    let resync: (() => void) | undefined
    let albumCalls = 0
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => {
        albumCalls += 1
        return albumCalls === 1
          ? []
          : [
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
            ]
      },
      connectRealtime: (_token, handlers) => {
        resync = handlers.onResync
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(resync).toBeTypeOf("function"))

    await act(async () => {
      resync?.()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
  })

  test("applies a directive from a console exactly once", async () => {
    const applied: string[] = []
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const configured: ReferenceClient = {
      ...client([]),
      listSessions: async () => [session({ id: "mine", hostDeviceId: "device-1" })],
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
      command: async (_token, sessionId, command) => {
        applied.push(`${sessionId}:${command._tag}`)
        return session({ id: sessionId, hostDeviceId: "device-1", transport: "paused" })
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceSessions />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    const directive: RpcSessionDirective = {
      sessionId: "mine",
      command: { _tag: "transport.pause", payload: {} },
      issuedBy: "device-2",
      directiveId: "directive-1",
    }
    await act(async () => {
      deliver?.(directive)
      // A reconnect can redeliver the same directive.
      deliver?.(directive)
      await Promise.resolve()
    })

    await waitFor(() => expect(applied).toEqual(["mine:transport.pause"]))
  })
})

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

  test("ignores an older placement response that completes last", async () => {
    let resolveFirst:
      | ((album: Awaited<ReturnType<ReferenceClient["setAlbumPlacement"]>>) => void)
      | undefined
    let resolveSecond:
      | ((album: Awaited<ReturnType<ReferenceClient["setAlbumPlacement"]>>) => void)
      | undefined
    let call = 0
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
      setAlbumPlacement: async () =>
        new Promise((resolve) => {
          call += 1
          if (call === 1) resolveFirst = resolve
          else resolveSecond = resolve
        }),
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))

    expect(screen.getByText(/archive — revision 1/)).toBeTruthy()
    await waitFor(() => expect(resolveFirst).toBeTypeOf("function"))
    await act(async () => {
      resolveFirst?.({
        id: "album-1",
        title: "Heroes",
        artist: "David Bowie",
        placement: RpcPlacement.Collection,
        placementUpdatedAt: "second",
        addedAt: "now",
        revision: 2,
        tracks: [],
      })
      await Promise.resolve()
    })
    expect(screen.getByText(/archive — revision 1/)).toBeTruthy()
    await waitFor(() => expect(resolveSecond).toBeTypeOf("function"))
    await act(async () => {
      resolveSecond?.({
        id: "album-1",
        title: "Heroes",
        artist: "David Bowie",
        placement: RpcPlacement.Archive,
        placementUpdatedAt: "third",
        addedAt: "now",
        revision: 3,
        tracks: [],
      })
      await Promise.resolve()
    })

    expect(screen.getByText(/archive — revision 3/)).toBeTruthy()
  })

  test("rolls back an optimistic placement when mutation and refresh both fail", async () => {
    let listCalls = 0
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => {
        listCalls += 1
        if (listCalls > 1) throw new Error("offline")
        return [
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
        ]
      },
      setAlbumPlacement: async () => {
        throw new Error("offline")
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    expect(screen.getByText(/collection — revision 1/)).toBeTruthy()

    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
  })

  test("rolls back two failed queued placements to the last confirmed album", async () => {
    let listCalls = 0
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => {
        listCalls += 1
        if (listCalls > 1) throw new Error("offline")
        return [
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
        ]
      },
      setAlbumPlacement: async () => {
        throw new Error("offline")
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))
    expect(screen.getByText(/archive — revision 1/)).toBeTruthy()

    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
  })

  test("keeps a stale refresh as confirmed truth for a later rollback", async () => {
    let listCalls = 0
    let resolveRefresh:
      | ((albums: Awaited<ReturnType<ReferenceClient["listAlbums"]>>) => void)
      | undefined
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => {
        listCalls += 1
        if (listCalls === 1) {
          return [
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
          ]
        }
        if (listCalls === 2) {
          return new Promise((resolve) => {
            resolveRefresh = resolve
          })
        }
        throw new Error("offline")
      },
      setAlbumPlacement: async () => {
        throw new Error("response lost")
      },
    }

    render(
      <ReferenceApp client={configured}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    await waitFor(() => expect(resolveRefresh).toBeTypeOf("function"))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))
    expect(screen.getByText(/archive — revision 1/)).toBeTruthy()
    await act(async () => {
      resolveRefresh?.([
        {
          id: "album-1",
          title: "Heroes",
          artist: "David Bowie",
          placement: RpcPlacement.Collection,
          placementUpdatedAt: "confirmed",
          addedAt: "now",
          revision: 2,
          tracks: [],
        },
      ])
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText(/collection — revision 2/)).toBeTruthy())
  })

  test("searches, queues, and loads audio through the reference binding", async () => {
    let session: Awaited<ReturnType<ReferenceClient["createSession"]>> | undefined
    let loadedTrack: string | undefined
    const configured: ReferenceClient = {
      ...client([]),
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
