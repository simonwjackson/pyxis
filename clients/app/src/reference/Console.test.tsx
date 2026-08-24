import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  type RealtimeEvent,
  type RpcLibraryAlbum,
  RpcPlacement,
  RpcRealtimeTopic,
  type RpcSession,
  type RpcSessionDirective,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { RpcError, type WorkerRpc } from "../rpc/client.ts"
import { createDirectWorkerClient, type WorkerClient } from "../worker/client.ts"
import { createMemoryEngine, openWorkerDatabase } from "../worker/database.ts"
import { sync as runWorkerSync } from "../worker/sync.ts"
import { ReferenceApp } from "./App.tsx"
import type { ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferenceOffline } from "./Offline.tsx"
import { ReferencePlugins } from "./Plugins.tsx"
import { ReferenceAudio } from "./ReferenceAudio.tsx"
import { ReferenceRemote } from "./Remote.tsx"
import { ReferenceSessions } from "./Sessions.tsx"
import { ReferenceUpdate } from "./Update.tsx"

function album(overrides: Partial<RpcLibraryAlbum> = {}): RpcLibraryAlbum {
  return {
    id: "album-1",
    title: "Heroes",
    artist: "David Bowie",
    placement: RpcPlacement.Discovery,
    placementUpdatedAt: "now",
    addedAt: "now",
    revision: 1,
    tracks: [],
    ...overrides,
  }
}

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsdom has no media stack. Give the element just enough behaviour to assert against.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: () => Promise.resolve(),
})
Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: () => {},
})

function persistent(worker: WorkerClient): WorkerClient {
  return {
    ...worker,
    open: async () => {
      const { ephemeral: _, ...report } = await worker.open()
      return report
    },
  }
}

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

describe("update banner", () => {
  test("stays hidden until the server serves a newer build", async () => {
    let announce: (() => void) | undefined
    const updates = {
      start: (onUpdate: () => void) => {
        announce = onUpdate
        return () => {}
      },
    }
    const reload = vi.fn()

    render(
      <ReferenceApp
        client={client([])}
        worker={createDirectWorkerClient()}
        updates={updates}
        reload={reload}
      >
        <ReferenceUpdate />
      </ReferenceApp>,
    )

    await waitFor(() => expect(announce).toBeTypeOf("function"))
    expect(screen.queryByRole("button", { name: "Reload to update" })).toBeNull()

    await act(async () => {
      announce?.()
      await Promise.resolve()
    })

    const button = await screen.findByRole("button", { name: "Reload to update" })
    // Nothing reloads until the person asks.
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe("local store", () => {
  test("opens at boot and reports what it kept", async () => {
    const store = createDirectWorkerClient()
    for (const id of ["album-1", "album-2", "album-3"]) {
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

    const offline: ReferenceClient = {
      ...client([]),
      claimDevice: async () => {
        throw new Error("offline")
      },
    }
    render(
      <ReferenceApp client={offline} worker={store}>
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText("created")).toBeTruthy())
    expect(screen.getByText("3")).toBeTruthy()
    // An in-process store must not claim to keep anything.
    expect(screen.getAllByText("false").length).toBeGreaterThan(0)
  })

  test("keeps booting when Cache Storage inspection fails", async () => {
    const base = persistent(createDirectWorkerClient())
    const store = {
      ...base,
      offlineOverview: async () => {
        throw new Error("Cache Storage unavailable")
      },
    }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferencePlugins />
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText("Status: ready")).toBeTruthy())
    expect(screen.getAllByText("false").length).toBeGreaterThan(0)
  })

  test("renders the durable library while Cache Storage inspection is still pending", async () => {
    const base = persistent(createDirectWorkerClient())
    await base.putAlbum(album())
    const waitingOverview = new Promise<Awaited<ReturnType<WorkerClient["offlineOverview"]>>>(
      () => undefined,
    )
    const store = {
      ...base,
      offlineOverview: () => waitingOverview,
    }
    const waitingForNetwork: ReferenceClient = {
      ...client([]),
      claimDevice: () => new Promise<never>(() => undefined),
    }

    render(
      <ReferenceApp client={waitingForNetwork} worker={store}>
        <ReferencePlugins />
        <ReferenceLibrary />
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText("Library albums (1)")).toBeTruthy())
    expect(screen.getByText(/Heroes/)).toBeTruthy()
    expect(screen.getByText("Loading plugins…")).toBeTruthy()
    expect(screen.queryByText(/No plugins installed/)).toBeNull()
    expect(screen.getAllByText("checking")).toHaveLength(3)
  })

  test("an ephemeral no-worker fallback still reads the online library", async () => {
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => [album()],
    }

    render(
      <ReferenceApp client={configured} worker={createDirectWorkerClient()}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
  })

  test("online boot gives credentials to the worker and reads its synced library", async () => {
    const base = createDirectWorkerClient()
    const sync = vi.fn(async () => {
      const settings = await base.settings()
      expect(settings).toMatchObject({
        accountId: "default",
        bearerToken: "token",
        deviceId: "device-1",
      })
      await base.replaceAlbums([album()])
      return {
        pulled: 1,
        pushed: 0,
        converged: 0,
        dropped: [],
        deferred: 0,
        conflicts: [],
        offline: false,
        authRequired: false,
      }
    })
    const store = { ...base, sync }
    const configured: ReferenceClient = {
      ...client([]),
      // Library data belongs to the worker. The page must not bypass it.
      listAlbums: async () => {
        throw new Error("page bypassed the worker")
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
    expect(screen.getByText("1")).toBeTruthy()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  test("shows conflicts and rejected writes from the last sync", async () => {
    const base = createDirectWorkerClient()
    const store = {
      ...base,
      sync: async () => ({
        pulled: 1,
        pushed: 0,
        converged: 1,
        dropped: [{ id: "01DROP", reason: "album no longer exists" }],
        deferred: 0,
        conflicts: [
          {
            albumId: "album-1",
            kept: RpcPlacement.Archive,
            discarded: RpcPlacement.Collection,
          },
        ],
        offline: false,
        authRequired: false,
      }),
    }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/album-1.*archive.*collection/)).toBeTruthy())
    expect(screen.getByText(/01DROP.*album no longer exists/)).toBeTruthy()
  })

  test("reload reuses the persisted account grant instead of claiming another device", async () => {
    const base = createDirectWorkerClient()
    await base.writeSettings({
      accountId: "default",
      accountName: "default",
      accountIsDefault: true,
      accountCreatedAt: "now",
      deviceId: "device-1",
      deviceName: "reference browser",
      bearerToken: "token",
    })
    const sync = vi.fn(base.sync)
    const store = { ...base, sync }
    const claimDevice = vi.fn(async () => {
      throw new Error("claim must not run on reload")
    })
    const configured: ReferenceClient = { ...client([]), claimDevice }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceSessions />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/Account: default/)).toBeTruthy())
    expect(claimDevice).not.toHaveBeenCalled()
    expect(sync).toHaveBeenCalledTimes(1)
  })

  test("an online event retries account boot after an offline first load", async () => {
    let claims = 0
    const claimDevice = vi.fn(async () => {
      claims += 1
      if (claims === 1) throw new Error("offline")
      return client([]).claimDevice("reference browser")
    })
    const configured: ReferenceClient = { ...client([]), claimDevice }

    render(
      <ReferenceApp client={configured} worker={createDirectWorkerClient()}>
        <ReferenceSessions />
      </ReferenceApp>,
    )
    await waitFor(() => expect(claimDevice).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event("online"))

    await waitFor(() => expect(screen.getByText(/Account: default/)).toBeTruthy())
    expect(claimDevice).toHaveBeenCalledTimes(2)
  })

  test("an online event retries worker sync", async () => {
    const base = createDirectWorkerClient()
    const sync = vi.fn(base.sync)
    const store = { ...base, sync }

    render(<ReferenceApp client={client([])} worker={store} />)
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event("online"))

    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2))
  })

  test("a network failure at boot renders the library already in the local store", async () => {
    const store = createDirectWorkerClient()
    await store.putAlbum(album())
    const offline: ReferenceClient = {
      ...client([]),
      claimDevice: async () => {
        throw new Error("offline")
      },
    }

    render(
      <ReferenceApp client={offline} worker={store}>
        <ReferenceLibrary />
        <ReferenceOffline />
      </ReferenceApp>,
    )

    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
    expect(screen.getByText("1")).toBeTruthy()
  })
})

describe("console mode", () => {
  test("does not publish cached remote reachability before a live session pull", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({
      accountId: "default",
      accountName: "default",
      accountIsDefault: true,
      accountCreatedAt: "now",
      bearerToken: "token",
      deviceId: "device-1",
      deviceName: "reference browser",
    })
    await database.putSession(session())
    const base = persistent(createDirectWorkerClient(async () => database))
    const sessions = vi.fn(base.sessions)
    const waitingSync = new Promise<Awaited<ReturnType<WorkerClient["sync"]>>>(() => undefined)
    const store = { ...base, sessions, sync: () => waitingSync }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceRemote />
      </ReferenceApp>,
    )

    await waitFor(() => expect(sessions).toHaveBeenCalled())
    expect(screen.queryByText(/Kitchen/)).toBeNull()
    expect(
      screen.getByText(
        "No other device is connected. Open this page on a second device to control it.",
      ),
    ).toBeTruthy()
  })

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

  test("publishes the durable grant before optional online metadata returns", async () => {
    let releasePlugins: (() => void) | undefined
    const listPlugins = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ReferenceClient["listPlugins"]>>>((resolve) => {
          releasePlugins = () => resolve([])
        }),
    )
    const loadStream = vi.fn(async () => "blob:track-1")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    render(
      <ReferenceApp client={{ ...client([]), listPlugins, loadStream }} worker={store}>
        <ReferenceAudio />
      </ReferenceApp>,
    )

    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(loadStream).toHaveBeenCalledTimes(1))

    act(() => releasePlugins?.())
    expect((await database.session("mine"))?.transport).toBe(RpcTransport.Playing)
  })

  test("a cold offline boot can play cached audio with the durable grant", async () => {
    const loadStream = vi.fn(async () => "blob:offline-track")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({
      accountId: "default",
      accountName: "default",
      accountIsDefault: true,
      accountCreatedAt: "now",
      bearerToken: "cached-token",
      deviceId: "device-1",
      deviceName: "reference browser",
    })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Stopped,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const offlineClient: ReferenceClient = {
      ...client([]),
      listPlugins: async () => {
        throw new Error("network unavailable")
      },
      loadStream,
    }
    render(
      <ReferenceApp client={offlineClient} worker={store}>
        <ReferencePlugins />
        <ReferenceConsole />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    const play = await screen.findByRole("button", { name: "Play" })

    fireEvent.click(play)

    await waitFor(() =>
      expect(loadStream).toHaveBeenCalledWith("cached-token", "track-1", {
        accountId: "default",
        deviceId: "device-1",
        streamEpoch: 0,
      }),
    )
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Playing),
    )
  })

  test("resuming after a pause does not reload the track", async () => {
    const loads: string[] = []
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async (_token, trackId) => {
        loads.push(trackId)
        return `blob:${trackId}`
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceConsole />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    await waitFor(() => expect(loads).toEqual(["track-1"]))
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Playing),
    )
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Playing),
    )

    expect(loads).toEqual(["track-1"])
  })

  test("records the paused position in the offline session outbox", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
        positionMs: 45_000,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceConsole />
        <ReferenceAudio />
      </ReferenceApp>,
    )

    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })
    await waitFor(() => expect(Math.round(audio.currentTime)).toBe(45))

    audio.currentTime = 61
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))

    await waitFor(async () => expect(await database.outbox()).toHaveLength(2))
    expect(await database.outbox()).toMatchObject([
      { kind: "session.command", command: { _tag: "transport.pause" } },
      {
        kind: "session.command",
        command: { _tag: "position.report", payload: { positionMs: 61_000 } },
      },
    ])
    expect(await database.session("mine")).toMatchObject({
      transport: RpcTransport.Paused,
      positionMs: 61_000,
    })
  })

  test("queues a whole library album in one offline command", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const store = persistent(createDirectWorkerClient(async () => database))
    await store.putAlbum(
      album({
        tracks: [
          { id: "track-1", title: "Beauty", artist: "David Bowie", trackNumber: 1, revision: 1 },
          { id: "track-2", title: "Heroes", artist: "David Bowie", trackNumber: 2, revision: 1 },
        ],
      }),
    )
    const configured: ReferenceClient = {
      ...client([]),
      createSession: async () => session({ id: "mine", hostDeviceId: "device-1" }),
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Queue album" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Queue album" }))

    await waitFor(async () =>
      expect((await database.session("mine"))?.queue).toEqual(["track-1", "track-2"]),
    )
    expect(await database.outbox()).toMatchObject([
      {
        kind: "session.command",
        command: { _tag: "queue.add", payload: { trackIds: ["track-1", "track-2"] } },
      },
    ])
  })

  test("a stale realtime album cannot overwrite queued local intent", async () => {
    let deliver: ((event: RealtimeEvent) => void | Promise<void>) | undefined
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album())
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onEvent
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    await waitFor(async () => expect(await database.outbox()).toHaveLength(1))

    await act(async () => {
      await deliver?.({
        topic: RpcRealtimeTopic.Library,
        resumeToken: "resume-1",
        state: { _tag: "library.album.state", payload: album() },
      })
    })

    expect(screen.getByText(/collection — revision 1/)).toBeTruthy()
    expect((await database.album("album-1"))?.placement).toBe(RpcPlacement.Collection)
  })

  test("a realtime removal resolves queued placement intent as a conflict", async () => {
    let deliver: ((event: RealtimeEvent) => void | Promise<void>) | undefined
    let removed = false
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const remote = album()
    const rpc: WorkerRpc = {
      listAlbums: async () => (removed ? [] : [remote]),
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      setPlacement: async () => {
        throw new RpcError("offline", true)
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const base = createDirectWorkerClient(async () => database)
    const store = persistent({ ...base, sync: async () => runWorkerSync(database, rpc) })
    const configured: ReferenceClient = {
      ...client([]),
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onEvent
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
        <ReferenceOffline />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    await waitFor(async () => expect(await database.outbox()).toHaveLength(1))

    removed = true
    await act(async () => {
      await deliver?.({
        topic: RpcRealtimeTopic.Library,
        resumeToken: "resume-2",
        state: { _tag: "library.album.removed", payload: { id: "album-1" } },
      })
    })

    await waitFor(() => expect(screen.queryByText(/Heroes/)).toBeNull())
    expect(await database.outbox()).toEqual([])
    expect(screen.getByText(/album-1.*removed.*collection/)).toBeTruthy()
  })

  test("refetches through the worker when the server dropped missed events", async () => {
    let resync: (() => void | Promise<void>) | undefined
    let syncCalls = 0
    const base = createDirectWorkerClient()
    const store = {
      ...base,
      sync: async () => {
        syncCalls += 1
        if (syncCalls > 1) await base.putAlbum(album())
        return {
          pulled: syncCalls > 1 ? 1 : 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: 0,
          conflicts: [],
          offline: false,
          authRequired: false,
        }
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      listAlbums: async () => {
        throw new Error("page bypassed the worker")
      },
      connectRealtime: (_token, handlers) => {
        resync = handlers.onResync
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(resync).toBeTypeOf("function"))

    await act(async () => {
      await resync?.()
    })

    await waitFor(() => expect(screen.getByText(/Heroes/)).toBeTruthy())
  })

  test("realtime resync keeps a queued hosted-session command", async () => {
    let resync: (() => void | Promise<void>) | undefined
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const original = session({ id: "mine", hostDeviceId: "device-1" })
    await database.putSession(original)
    await database.queueSessionCommand(original, {
      _tag: "queue.add",
      payload: { trackIds: ["track-1"] },
    })
    const store = persistent(createDirectWorkerClient(async () => database))
    const listSessions = vi.fn(async () => {
      throw new Error("page bypassed the worker")
    })
    const configured: ReferenceClient = {
      ...client([]),
      listSessions,
      connectRealtime: (_token, handlers) => {
        resync = handlers.onResync
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceSessions />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getAllByText("track-1").length).toBe(2))

    await act(async () => {
      await resync?.()
    })

    await waitFor(() => expect(screen.getAllByText("track-1").length).toBe(2))
    expect(listSessions).not.toHaveBeenCalled()
  })

  test("applies a directive from a console exactly once", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
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
    act(() => {
      deliver?.(directive)
      deliver?.(directive)
    })

    await waitFor(async () => expect(await database.outbox()).toHaveLength(1))
    expect(await database.outbox()).toMatchObject([
      {
        kind: "session.command",
        commandId: "directive-1",
        command: { _tag: "transport.pause" },
      },
    ])
  })

  test("retries a directive whose first local write failed", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const base = persistent(createDirectWorkerClient())
    await base.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    let attempts = 0
    const store = {
      ...base,
      queueSessionCommand: async (...args: Parameters<WorkerClient["queueSessionCommand"]>) => {
        attempts += 1
        if (attempts === 1) throw new Error("quota exceeded")
        return base.queueSessionCommand(...args)
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(<ReferenceApp client={configured} worker={store} />)
    await waitFor(() => expect(deliver).toBeTypeOf("function"))
    const directive: RpcSessionDirective = {
      sessionId: "mine",
      command: { _tag: "transport.pause", payload: {} },
      issuedBy: "device-2",
      directiveId: "directive-1",
    }

    act(() => deliver?.(directive))
    await waitFor(() => expect(attempts).toBe(1))
    act(() => deliver?.(directive))

    await waitFor(() => expect(attempts).toBe(2))
  })

  test("does not repeat renderer effects for a durable directive receipt", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const stopped = session({
      id: "mine",
      hostDeviceId: "device-1",
      queue: ["track-1"],
      cursor: 0,
      currentTrackId: "track-1",
      transport: RpcTransport.Stopped,
    })
    await database.putSession(stopped)
    const playing = await database.queueSessionCommand(
      stopped,
      { _tag: "transport.play", payload: {} },
      "play-1",
    )
    await database.queueSessionCommand(
      playing,
      { _tag: "transport.pause", payload: {} },
      "pause-later",
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-1",
      }),
    )

    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(play).not.toHaveBeenCalled()
  })

  test("a redundant Play cannot suppress a later same-device Pause", async () => {
    let deliverDirective: ((directive: RpcSessionDirective) => void) | undefined
    let deliverEvent: ((event: RealtimeEvent) => void | Promise<void>) | undefined
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliverDirective = handlers.onDirective
        deliverEvent = handlers.onEvent
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliverDirective).toBeTypeOf("function"))
    await waitFor(() => expect(document.querySelector("audio")).not.toBeNull())

    act(() =>
      deliverDirective?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-again",
      }),
    )
    await waitFor(async () => expect((await database.session("mine"))?.revision).toBe(2))
    const playing = await database.session("mine")
    expect(playing).toBeDefined()
    if (playing === undefined) return
    const paused = {
      ...playing,
      transport: RpcTransport.Paused,
      revision: playing.revision + 1,
      updatedAt: "later",
    }
    await database.putSession(paused)
    pause.mockClear()

    await act(async () => {
      await deliverEvent?.({
        topic: RpcRealtimeTopic.Sessions,
        resumeToken: "resume-pause",
        state: { _tag: "session.state", payload: paused },
      })
    })

    await waitFor(() => expect(pause).toHaveBeenCalled())
  })

  test("does not report a directed Play when the browser refuses autoplay", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("autoplay refused"))
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Stopped,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-1",
      }),
    )

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("autoplay refused"))
    expect((await database.session("mine"))?.transport).toBe(RpcTransport.Stopped)
    expect(await database.outbox()).toEqual([])
  })

  test("rejects a stale cursor directive before stopping real audio", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(document.querySelector("audio")).not.toBeNull())
    await waitFor(() => expect(deliver).toBeTypeOf("function"))
    pause.mockClear()

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "cursor.jump", payload: { index: 4 } },
        issuedBy: "device-2",
        directiveId: "jump-1",
      }),
    )

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("outside the queue"),
    )
    expect(pause).not.toHaveBeenCalled()
    expect(document.querySelector("audio")).not.toBeNull()
    expect((await database.session("mine"))?.transport).toBe(RpcTransport.Playing)
    expect(await database.outbox()).toEqual([])
  })

  test("rolls the renderer back when a confirmed Play cannot enter durable storage", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    let deliverEvent: ((event: RealtimeEvent) => void | Promise<void>) | undefined
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Stopped,
      }),
    )
    const base = persistent(createDirectWorkerClient(async () => database))
    const store = {
      ...base,
      queueSessionCommand: async () => {
        throw new Error("quota exceeded")
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        deliverEvent = handlers.onEvent
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-1",
      }),
    )

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("quota exceeded"))
    expect(pause).toHaveBeenCalled()
    expect((await database.session("mine"))?.transport).toBe(RpcTransport.Stopped)
    expect(await database.outbox()).toEqual([])

    const playing = session({
      id: "mine",
      hostDeviceId: "device-1",
      queue: ["track-1"],
      cursor: 0,
      currentTrackId: "track-1",
      transport: RpcTransport.Playing,
      revision: 2,
      updatedAt: "later",
    })
    await database.putSession(playing)
    await act(async () => {
      await deliverEvent?.({
        topic: RpcRealtimeTopic.Sessions,
        resumeToken: "resume-playing",
        state: { _tag: "session.state", payload: playing },
      })
    })

    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  })

  test("corrects a persisted Playing session when autoplay fails on reload", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("autoplay refused"))
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(await database.outbox()).toMatchObject([
      { kind: "session.command", command: { _tag: "transport.pause" } },
    ])
    expect(screen.getByRole("alert").textContent).toContain("autoplay refused")
  })

  test("latches a media error between Play confirmation and durable state", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    let releaseWrite: (() => void) | undefined
    let writes = 0
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Stopped,
      }),
    )
    const base = persistent(createDirectWorkerClient(async () => database))
    const store = {
      ...base,
      queueSessionCommand: async (...args: Parameters<WorkerClient["queueSessionCommand"]>) => {
        writes += 1
        if (writes === 1) {
          await new Promise<void>((resolve) => {
            releaseWrite = resolve
          })
        }
        return base.queueSessionCommand(...args)
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-1",
      }),
    )
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })
    await waitFor(() => expect(releaseWrite).toBeTypeOf("function"))

    fireEvent.error(audio)
    await act(async () => {
      releaseWrite?.()
      await Promise.resolve()
    })

    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(await database.outbox()).toMatchObject([
      { command: { _tag: "transport.play" } },
      { command: { _tag: "transport.pause" } },
    ])
    expect(screen.getByRole("alert").textContent).toContain("could not decode or load audio")
  })

  test("reports Paused when loaded audio later raises a media error", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })

    fireEvent.error(audio)

    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(await database.outbox()).toMatchObject([
      { kind: "session.command", command: { _tag: "transport.pause" } },
    ])
    expect(screen.getByRole("alert").textContent).toContain("could not decode or load audio")
  })

  test("corrects Playing when the stream request itself fails", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => {
        throw new Error("stream unavailable")
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )

    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(await database.outbox()).toMatchObject([
      { kind: "session.command", command: { _tag: "transport.pause" } },
    ])
    expect(screen.getByRole("alert").textContent).toContain("stream unavailable")
  })

  test("rolls volume back when its durable command write fails", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
        volume: 100,
      }),
    )
    const base = persistent(createDirectWorkerClient(async () => database))
    const store = {
      ...base,
      queueSessionCommand: async () => {
        throw new Error("quota exceeded")
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "volume.set", payload: { volume: 25 } },
        issuedBy: "device-2",
        directiveId: "volume-1",
      }),
    )

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("quota exceeded"))
    expect(audio.volume).toBe(1)
    expect((await database.session("mine"))?.volume).toBe(100)
  })

  test("serializes a cursor change behind a directed Play that is loading", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    let releaseStream: (() => void) | undefined
    const loadStream = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseStream = () => resolve("blob:track-1")
        }),
    )
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1", "track-2"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Stopped,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream,
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.play", payload: {} },
        issuedBy: "device-2",
        directiveId: "play-1",
      }),
    )
    await waitFor(() => expect(loadStream).toHaveBeenCalledTimes(1))
    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "cursor.jump", payload: { index: 1 } },
        issuedBy: "device-2",
        directiveId: "jump-1",
      }),
    )

    await act(async () => {
      releaseStream?.()
      await Promise.resolve()
    })

    await waitFor(async () =>
      expect(await database.session("mine")).toMatchObject({
        currentTrackId: "track-2",
        transport: RpcTransport.Stopped,
      }),
    )
    expect(await database.outbox()).toMatchObject([
      { commandId: "play-1", command: { _tag: "transport.play" } },
      { commandId: "jump-1", command: { _tag: "cursor.jump" } },
    ])
  })

  test("a directed Pause cancels a stream that is still loading", async () => {
    let deliver: ((directive: RpcSessionDirective) => void) | undefined
    let releaseStream: (() => void) | undefined
    const loadStream = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseStream = () => resolve("blob:track-1")
        }),
    )
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      loadStream,
      connectRealtime: (_token, handlers) => {
        deliver = handlers.onDirective
        return () => {}
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceAudio />
      </ReferenceApp>,
    )
    await waitFor(() => expect(loadStream).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(deliver).toBeTypeOf("function"))

    act(() =>
      deliver?.({
        sessionId: "mine",
        command: { _tag: "transport.pause", payload: {} },
        issuedBy: "device-2",
        directiveId: "pause-1",
      }),
    )

    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    expect(await database.outbox()).toMatchObject([
      { kind: "session.command", commandId: "pause-1", command: { _tag: "transport.pause" } },
    ])

    await act(async () => {
      releaseStream?.()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByText("No audio loaded.")).toBeTruthy())
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

  test("pins an album through the worker download boundary", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(
      album({
        tracks: [
          {
            id: "track-1",
            title: "Heroes",
            artist: "David Bowie",
            trackNumber: 1,
            revision: 1,
          },
        ],
      }),
    )
    const base = persistent(createDirectWorkerClient(async () => database))
    const initial = { available: true, albums: [], totalBytes: 0 } as const
    const ready = {
      available: true,
      totalBytes: 100,
      albums: [
        {
          albumId: "album-1",
          state: "ready" as const,
          totalTracks: 1,
          readyTracks: 1,
          bytes: 100,
        },
      ],
    }
    const pinAlbum = vi.fn(async () => ready)
    const store = {
      ...base,
      offlineOverview: async () => initial,
      resumeOffline: async () => initial,
      pinAlbum,
    }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    const pin = await screen.findByRole("button", { name: "Pin offline" })
    fireEvent.click(pin)

    await waitFor(() => expect(pinAlbum).toHaveBeenCalledWith("album-1"))
    await waitFor(() => expect(screen.getByText(/offline ready \(1\/1\)/u)).toBeTruthy())
  })

  test("keeps an offline placement visible and queued in the local worker", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album())
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      setAlbumPlacement: async () => {
        throw new Error("page bypassed the worker")
      },
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))

    await waitFor(() => expect(screen.getByText(/collection — revision 1/)).toBeTruthy())
    expect(await database.outbox()).toMatchObject([
      {
        kind: "album.placement",
        albumId: "album-1",
        placement: RpcPlacement.Collection,
        basePlacement: RpcPlacement.Discovery,
      },
    ])
  })

  test("queues rapid offline placements in the order they were made", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album())
    const store = persistent(createDirectWorkerClient(async () => database))

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))

    await waitFor(() => expect(screen.getByText(/archive — revision 1/)).toBeTruthy())
    await waitFor(async () => expect(await database.outbox()).toHaveLength(2))
    const queued = await database.outbox()
    expect(queued).toMatchObject([
      {
        kind: "album.placement",
        placement: RpcPlacement.Collection,
        basePlacement: RpcPlacement.Discovery,
      },
      {
        kind: "album.placement",
        placement: RpcPlacement.Archive,
        basePlacement: RpcPlacement.Collection,
      },
    ])
  })

  test("persists a second rapid placement while the first sync is still blocked", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album())
    const base = createDirectWorkerClient(async () => database)
    let releaseSync: (() => void) | undefined
    let syncCalls = 0
    const store = {
      ...base,
      sync: async () => {
        syncCalls += 1
        if (syncCalls === 2) {
          await new Promise<void>((resolve) => {
            releaseSync = resolve
          })
        }
        return {
          pulled: 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: (await database.outbox()).length,
          conflicts: [],
          offline: syncCalls > 1,
          authRequired: false,
        }
      },
    }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    await waitFor(() => expect(releaseSync).toBeTypeOf("function"))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))

    await waitFor(async () => expect(await database.outbox()).toHaveLength(2))
    releaseSync?.()
  })

  test("keeps the second rapid placement visible when the network drops after the first", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putAlbum(album())
    const base = createDirectWorkerClient(async () => database)
    let remote = album()
    let writes = 0
    const rpc: WorkerRpc = {
      listAlbums: async () => [remote],
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      setPlacement: async (_albumId, placement) => {
        writes += 1
        if (writes > 1) throw new RpcError("offline", true)
        remote = {
          ...remote,
          placement,
          placementUpdatedAt: "later",
          revision: 2,
        }
        return remote
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const store = { ...base, sync: async () => runWorkerSync(database, rpc) }

    render(
      <ReferenceApp client={client([])} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    await waitFor(() => expect(screen.getByText(/discovery — revision 1/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "collection" }))
    fireEvent.click(screen.getByRole("button", { name: "archive" }))

    await waitFor(() => expect(screen.getByText(/archive — revision 2/)).toBeTruthy())
    expect(await database.album("album-1")).toMatchObject({
      placement: RpcPlacement.Archive,
      revision: 2,
    })
    expect(await database.outbox()).toMatchObject([
      { placement: RpcPlacement.Archive, basePlacement: RpcPlacement.Collection },
    ])
  })

  test("a pause racing audio-ended keeps the listen and does not queue stale ended state", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.putSession(
      session({
        id: "mine",
        hostDeviceId: "device-1",
        queue: ["track-1"],
        cursor: 0,
        currentTrackId: "track-1",
        transport: RpcTransport.Playing,
      }),
    )
    const base = persistent(createDirectWorkerClient(async () => database))
    let releaseListen: (() => void) | undefined
    const store = {
      ...base,
      queueListen: async (...args: Parameters<WorkerClient["queueListen"]>) => {
        await new Promise<void>((resolve) => {
          releaseListen = resolve
        })
        return base.queueListen(...args)
      },
    }
    const configured: ReferenceClient = {
      ...client([]),
      loadStream: async () => "blob:track-1",
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceConsole />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })

    fireEvent.ended(audio)
    await waitFor(() => expect(releaseListen).toBeTypeOf("function"))
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    await waitFor(async () =>
      expect((await database.session("mine"))?.transport).toBe(RpcTransport.Paused),
    )
    releaseListen?.()

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("cannot end"))
    expect(await database.outbox()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: { _tag: "transport.pause", payload: {} } }),
        expect.objectContaining({ kind: "listen.append" }),
      ]),
    )
    expect(await database.outbox()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: { _tag: "transport.trackEnded", payload: {} } }),
      ]),
    )
  })

  test("queues a completed listen locally before any network call", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const store = createDirectWorkerClient(async () => database)
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
        }),
      ],
      appendListen: async () => {
        throw new Error("page bypassed the worker")
      },
      command: async () => {
        throw new Error("offline")
      },
      loadStream: async () => "blob:track-1",
    }

    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferencePlugins />
        <ReferenceAudio />
      </ReferenceApp>,
    )
    const audio = await waitFor(() => {
      const element = document.querySelector("audio")
      if (element === null) throw new Error("audio element not mounted")
      return element
    })
    Object.defineProperty(audio, "duration", { configurable: true, value: 12 })
    fireEvent.ended(audio)

    await waitFor(async () => expect(await database.outbox()).toHaveLength(2))
    expect(await database.outbox()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "listen.append",
          event: expect.objectContaining({
            trackId: "track-1",
            deviceId: "device-1",
            playedMs: 12_000,
          }),
        }),
        expect.objectContaining({
          kind: "session.command",
          command: { _tag: "transport.trackEnded", payload: {} },
        }),
      ]),
    )
  })

  test("two rapid first queue writes create one hosted session", async () => {
    let createCalls = 0
    let finishCreate: ((session: RpcSession) => void) | undefined
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    const store = persistent(createDirectWorkerClient(async () => database))
    const configured: ReferenceClient = {
      ...client([]),
      search: async () => ({
        noSources: false,
        failures: [],
        tracks: [
          { id: "track-1", title: "One", artist: "Artist", sourcePluginId: "source" },
          { id: "track-2", title: "Two", artist: "Artist", sourcePluginId: "source" },
        ],
      }),
      createSession: async () => {
        createCalls += 1
        return new Promise((resolve) => {
          finishCreate = resolve
        })
      },
    }
    render(
      <ReferenceApp client={configured} worker={store}>
        <ReferenceLibrary />
      </ReferenceApp>,
    )
    fireEvent.change(await screen.findByLabelText("Query"), { target: { value: "Artist" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    const buttons = await screen.findAllByRole("button", { name: "Add to queue" })

    fireEvent.click(buttons[0] as HTMLElement)
    fireEvent.click(buttons[1] as HTMLElement)
    await waitFor(() => expect(createCalls).toBe(1))
    finishCreate?.(session({ id: "mine", hostDeviceId: "device-1" }))

    await waitFor(async () =>
      expect((await database.session("mine"))?.queue).toEqual(["track-1", "track-2"]),
    )
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
