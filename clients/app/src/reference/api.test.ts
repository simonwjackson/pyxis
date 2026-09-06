import { describe, expect, test, vi } from "vitest"
import { RpcPlacement, RpcRealtimeTopic } from "../../../../contracts/generated/pyxis"
import { createReferenceClient } from "./api"

class FakeSocket {
  readonly sent: string[] = []
  closed = false
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()

  addEventListener(type: string, listener: (event: never) => void): void {
    const current = this.listeners.get(type) ?? []
    current.push(listener as (event: unknown) => void)
    this.listeners.set(type, current)
  }

  send(message: string): void {
    this.sent.push(message)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  message(value: unknown): void {
    this.emit("message", { data: JSON.stringify(value) })
  }
}

describe("reference stream client", () => {
  test("uses a service-worker-authorized direct URL for streaming playback", async () => {
    const request = vi.fn()
    const authorizeDirectStream = vi.fn(async () => ({
      candidateUrl: "https://pyxis.test/__pyxis/offline/default/device-1/candidate-1",
      cacheName: "pyxis-offline-staging-v1",
    }))
    const client = createReferenceClient({
      fetch: request as unknown as typeof fetch,
      authorizeDirectStream,
    })

    await expect(
      client.loadStream("token", "track-1", {
        accountId: "default",
        deviceId: "device-1",
        streamEpoch: 0,
      }),
    ).resolves.toContain("/stream/track-1?pyxisAccount=default&pyxisDevice=device-1&pyxisEpoch=0")
    expect(authorizeDirectStream).toHaveBeenCalledWith({
      token: "token",
      accountId: "default",
      deviceId: "device-1",
      streamEpoch: 0,
      trackId: "track-1",
    })
    expect(request).not.toHaveBeenCalled()
  })

  test("falls back to a fetched object URL before a service worker controls the page", async () => {
    const request = vi.fn(async () => new Response("audio"))
    const client = createReferenceClient({
      fetch: request as unknown as typeof fetch,
      createObjectUrl: () => "blob:fallback",
      authorizeDirectStream: async () => undefined,
    })

    await expect(
      client.loadStream("token", "track-1", {
        accountId: "default",
        deviceId: "device-1",
        streamEpoch: 0,
      }),
    ).resolves.toBe("blob:fallback")
  })
})

describe("reference output client", () => {
  test("lists output targets and creates a core-hosted session", async () => {
    const requests: unknown[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { _tag: string }
      requests.push(request)
      if (request._tag === "output.targets.list") {
        return Response.json({
          _tag: "output.targets.list",
          outcome: {
            status: "ready",
            value: {
              pluginId: "sonos",
              groups: [],
              refreshedAt: 1,
              authoritative: true,
            },
          },
        })
      }
      if (request._tag === "output.group.set") {
        return Response.json({
          _tag: "output.group.set",
          outcome: {
            status: "ready",
            value: {
              pluginId: "sonos",
              groups: [],
              refreshedAt: 2,
              authoritative: true,
            },
          },
        })
      }
      return Response.json({
        _tag: "output.session.create",
        outcome: {
          status: "ready",
          value: {
            id: "session-output",
            name: "Kitchen",
            hostDeviceId: "output:sonos:RINCON_KITCHEN",
            queue: [],
            transport: "stopped",
            positionMs: 0,
            volume: 100,
            output: { pluginId: "sonos", targetId: "RINCON_KITCHEN" },
            reachable: true,
            revision: 1,
            updatedAt: "now",
          },
        },
      })
    })
    const client = createReferenceClient({ fetch: fetcher as unknown as typeof fetch })

    await expect(client.listOutputTargets("token", "sonos")).resolves.toMatchObject({
      pluginId: "sonos",
    })
    await expect(
      client.createOutputSession("token", "sonos", "RINCON_KITCHEN", "Kitchen"),
    ).resolves.toMatchObject({ output: { pluginId: "sonos", targetId: "RINCON_KITCHEN" } })
    await expect(
      client.setOutputGroup("token", "sonos", "RINCON_KITCHEN", ["RINCON_KITCHEN"]),
    ).resolves.toMatchObject({ refreshedAt: 2 })
    expect(requests).toMatchObject([
      { _tag: "output.targets.list", payload: { pluginId: "sonos" } },
      {
        _tag: "output.session.create",
        payload: { pluginId: "sonos", targetId: "RINCON_KITCHEN", name: "Kitchen" },
      },
      {
        _tag: "output.group.set",
        payload: {
          pluginId: "sonos",
          coordinatorId: "RINCON_KITCHEN",
          memberIds: ["RINCON_KITCHEN"],
        },
      },
    ])
  })

  test("preserves the typed output discovery failure", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        _tag: "output.targets.list",
        outcome: {
          status: "unavailable",
          value: {
            code: "sonos.unavailable",
            message: "no Sonos room answered topology refresh",
            retryable: true,
          },
        },
      }),
    )
    const client = createReferenceClient({ fetch: fetcher as unknown as typeof fetch })

    await expect(client.listOutputTargets("token", "sonos")).rejects.toThrow(
      "sonos.unavailable: no Sonos room answered topology refresh",
    )
  })
})

describe("reference realtime client", () => {
  test.each(["state", "cursor"] as const)(
    "discards already queued frames after a failed %s write",
    async (stage) => {
      vi.useFakeTimers()
      const sockets: FakeSocket[] = []
      let rejectWrite!: (cause: Error) => void
      const blocked = new Promise<void>((_, reject) => {
        rejectWrite = reject
      })
      const onEvent = vi.fn(() => (stage === "state" ? blocked : undefined))
      const onResumeToken = vi.fn(() => (stage === "cursor" ? blocked : undefined))
      const onDirective = vi.fn()
      const client = createReferenceClient({
        createWebSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket as unknown as WebSocket
        },
      })
      const disconnect = client.connectRealtime(
        "token",
        {
          onEvent,
          onResumeToken,
          onDirective,
          onResync: () => {},
        },
        "durable",
      )
      try {
        const first = socketAt(sockets, 0)
        first.message(realtimeEvent("failed"))
        await vi.advanceTimersByTimeAsync(0)
        first.message(realtimeEvent("later"))
        first.message({ _tag: "realtime.command", payload: {} })
        rejectWrite(new Error("write failed"))
        await vi.advanceTimersByTimeAsync(0)
        expect(first.closed).toBe(true)
        expect(onEvent).toHaveBeenCalledTimes(1)
        expect(onResumeToken).toHaveBeenCalledTimes(stage === "cursor" ? 1 : 0)
        expect(onDirective).not.toHaveBeenCalled()
        first.emit("close")
        await vi.advanceTimersByTimeAsync(1000)
        socketAt(sockets, 1).emit("open")
        expect(JSON.parse(socketAt(sockets, 1).sent[0] ?? "{}")).toMatchObject({
          payload: { resumeToken: "durable" },
        })
      } finally {
        disconnect()
        vi.useRealTimers()
      }
    },
  )

  test.each(["resync", "event"] as const)(
    "a retired socket cannot publish a cursor after its pending %s finishes",
    async (stage) => {
      vi.useFakeTimers()
      const sockets: FakeSocket[] = []
      let finish!: () => void
      const blocked = new Promise<void>((resolve) => {
        finish = resolve
      })
      const persisted: string[] = []
      const onConnected = vi.fn()
      const onResync = vi.fn().mockImplementationOnce(() => blocked)
      const client = createReferenceClient({
        createWebSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket as unknown as WebSocket
        },
      })
      const disconnect = client.connectRealtime(
        "token",
        {
          onEvent: () => blocked,
          onResync,
          onDirective: () => {},
          onResumeToken: (token) => {
            persisted.push(token)
          },
          onConnected,
        },
        "durable",
      )
      try {
        socketAt(sockets, 0).message(
          stage === "resync" ? realtimeWelcome("retired", true) : realtimeEvent("retired"),
        )
        await vi.advanceTimersByTimeAsync(0)
        socketAt(sockets, 0).emit("close")
        await vi.advanceTimersByTimeAsync(1000)
        socketAt(sockets, 1).message(realtimeWelcome("current"))
        await vi.advanceTimersByTimeAsync(0)
        expect(persisted).toEqual(["current"])
        finish()
        await vi.advanceTimersByTimeAsync(0)
        expect(persisted).toEqual(["current"])
        expect(onConnected).toHaveBeenCalledTimes(1)
        socketAt(sockets, 1).emit("close")
        await vi.advanceTimersByTimeAsync(1000)
        socketAt(sockets, 2).emit("open")
        expect(JSON.parse(socketAt(sockets, 2).sent[0] ?? "{}")).toMatchObject({
          payload: { resumeToken: "current" },
        })
      } finally {
        disconnect()
        vi.useRealTimers()
      }
    },
  )

  test("disposal fences pending resync and queued directives", async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const blocked = new Promise<void>((resolve) => {
      finish = resolve
    })
    const socket = new FakeSocket()
    const onResumeToken = vi.fn()
    const onConnected = vi.fn()
    const onDirective = vi.fn()
    const client = createReferenceClient({ createWebSocket: () => socket as unknown as WebSocket })
    const disconnect = client.connectRealtime("token", {
      onEvent: () => {},
      onResync: () => blocked,
      onResumeToken,
      onConnected,
      onDirective,
    })
    try {
      socket.message(realtimeWelcome("retired"))
      socket.message({ _tag: "realtime.command", payload: {} })
      await vi.advanceTimersByTimeAsync(0)
      disconnect()
      finish()
      await vi.advanceTimersByTimeAsync(0)
      expect(onResumeToken).not.toHaveBeenCalled()
      expect(onConnected).not.toHaveBeenCalled()
      expect(onDirective).not.toHaveBeenCalled()
    } finally {
      disconnect()
      vi.useRealTimers()
    }
  })

  test.each(["close", "timeout"] as const)(
    "serializes cursor storage across %s reconnects",
    async (reason) => {
      vi.useFakeTimers()
      const sockets: FakeSocket[] = []
      let finish!: () => void
      const blocked = new Promise<void>((resolve) => {
        finish = resolve
      })
      const persisted: string[] = []
      const onConnected = vi.fn()
      const onResumeToken = vi.fn(async (token: string) => {
        if (token === "retired") await blocked
        persisted.push(token)
      })
      const client = createReferenceClient({
        createWebSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket as unknown as WebSocket
        },
      })
      const disconnect = client.connectRealtime(
        "token",
        {
          onEvent: () => {},
          onResync: () => {},
          onDirective: () => {},
          onResumeToken,
          onConnected,
        },
        "durable",
      )
      try {
        socketAt(sockets, 0).message(realtimeWelcome("retired"))
        await vi.advanceTimersByTimeAsync(0)
        expect(onResumeToken).toHaveBeenCalledTimes(1)
        if (reason === "timeout") {
          await vi.advanceTimersByTimeAsync(30_000)
          expect(socketAt(sockets, 0).closed).toBe(true)
        }
        socketAt(sockets, 0).emit("close")
        await vi.advanceTimersByTimeAsync(1000)
        socketAt(sockets, 1).message(realtimeWelcome("current"))
        await vi.advanceTimersByTimeAsync(0)
        expect(onResumeToken).toHaveBeenCalledTimes(1)
        finish()
        await vi.advanceTimersByTimeAsync(0)
        expect(persisted).toEqual(["retired", "current"])
        expect(onConnected).toHaveBeenCalledTimes(1)
        socketAt(sockets, 1).emit("close")
        await vi.advanceTimersByTimeAsync(1000)
        socketAt(sockets, 2).emit("open")
        expect(JSON.parse(socketAt(sockets, 2).sent[0] ?? "{}")).toMatchObject({
          payload: { resumeToken: "current" },
        })
      } finally {
        disconnect()
        vi.useRealTimers()
      }
    },
  )

  test("persists an event cursor only after its state handler finishes", async () => {
    const socket = new FakeSocket()
    let finishEvent: (() => void) | undefined
    const eventApplied = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          finishEvent = resolve
        }),
    )
    const persisted: string[] = []
    const client = createReferenceClient({
      realtimeUrl: "ws://example/realtime",
      createWebSocket: () => socket as unknown as WebSocket,
    })
    client.connectRealtime(
      "token",
      {
        onEvent: eventApplied,
        onDirective: () => {},
        onResync: () => {},
        onResumeToken: async (token) => {
          persisted.push(token)
        },
      },
      "resume-old",
    )
    socket.emit("open")
    expect(JSON.parse(socket.sent[0] ?? "{}")).toMatchObject({
      payload: { resumeToken: "resume-old" },
    })

    socket.message({
      _tag: "realtime.event",
      payload: {
        topic: RpcRealtimeTopic.Library,
        resumeToken: "resume-new",
        state: {
          _tag: "library.album.state",
          payload: {
            id: "album-1",
            title: "Heroes",
            artist: "David Bowie",
            placement: RpcPlacement.Discovery,
            placementUpdatedAt: "now",
            addedAt: "now",
            revision: 1,
            tracks: [],
          },
        },
      },
    })
    await vi.waitFor(() => expect(eventApplied).toHaveBeenCalledTimes(1))
    expect(persisted).toEqual([])

    finishEvent?.()
    await vi.waitFor(() => expect(persisted).toEqual(["resume-new"]))
  })

  test("a failed state handler closes the socket without advancing its cursor", async () => {
    const socket = new FakeSocket()
    const persisted: string[] = []
    const failed = vi.fn()
    const client = createReferenceClient({
      createWebSocket: () => socket as unknown as WebSocket,
    })
    client.connectRealtime(
      "token",
      {
        onEvent: async () => {
          throw new Error("database write failed")
        },
        onDirective: () => {},
        onResync: () => {},
        onResumeToken: async (token) => {
          persisted.push(token)
        },
        onFailure: failed,
      },
      "resume-old",
    )
    socket.emit("open")
    const event = (resumeToken: string) => ({
      _tag: "realtime.event",
      payload: {
        topic: RpcRealtimeTopic.Library,
        resumeToken,
        state: { _tag: "library.album.removed", payload: { id: "album-1" } },
      },
    })

    socket.message(event("resume-failed"))
    await vi.waitFor(() => expect(socket.closed).toBe(true))
    socket.message(event("resume-later"))

    expect(persisted).toEqual([])
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ message: "database write failed" }),
    )
  })

  test("surfaces a terminal server failure before reconnecting", async () => {
    const socket = new FakeSocket()
    const failed = vi.fn()
    const client = createReferenceClient({
      createWebSocket: () => socket as unknown as WebSocket,
    })
    client.connectRealtime("token", {
      onEvent: () => {},
      onDirective: () => {},
      onResync: () => {},
      onResumeToken: () => {},
      onFailure: failed,
    })
    socket.emit("open")
    socket.message({
      _tag: "realtime.failure",
      payload: {
        code: "realtime.scopeRequired",
        message: "topic sessions requires scope session:read",
        retryable: false,
      },
    })

    await vi.waitFor(() => expect(socket.closed).toBe(true))
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "realtime.scopeRequired: topic sessions requires scope session:read",
      }),
    )
  })

  test("drops reachability when welcome resync cannot finish", async () => {
    const socket = new FakeSocket()
    const failed = vi.fn()
    const connected = vi.fn()
    const client = createReferenceClient({
      createWebSocket: () => socket as unknown as WebSocket,
      realtimeResyncTimeoutMs: 5,
    })
    client.connectRealtime("token", {
      onEvent: () => {},
      onDirective: () => {},
      onResync: () => new Promise<never>(() => undefined),
      onResumeToken: () => {},
      onConnected: connected,
      onFailure: failed,
    })
    socket.emit("open")
    socket.message({
      _tag: "realtime.welcome",
      payload: { resumeToken: "resume-first", missedEventsDropped: false, topics: [] },
    })

    await vi.waitFor(() => expect(socket.closed).toBe(true))
    expect(connected).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ message: "realtime resync timed out" }),
    )
  })

  test("reconnects from the last durable cursor and reports recovery", async () => {
    vi.useFakeTimers()
    try {
      const first = new FakeSocket()
      const second = new FakeSocket()
      const sockets = [first, second]
      let opened = 0
      const connected = vi.fn()
      const failed = vi.fn()
      const persisted: string[] = []
      const client = createReferenceClient({
        createWebSocket: () => sockets[opened++] as unknown as WebSocket,
      })
      const disconnect = client.connectRealtime(
        "token",
        {
          onEvent: () => {},
          onDirective: () => {},
          onResync: () => {},
          onResumeToken: async (token) => {
            persisted.push(token)
          },
          onConnected: connected,
          onFailure: failed,
        },
        "resume-old",
      )

      first.emit("open")
      first.message({
        _tag: "realtime.welcome",
        payload: { resumeToken: "resume-new", missedEventsDropped: false, topics: [] },
      })
      await vi.waitFor(() => expect(connected).toHaveBeenCalledTimes(1))
      first.emit("close")
      expect(failed).toHaveBeenCalledWith(
        expect.objectContaining({ message: "realtime connection closed" }),
      )

      await vi.advanceTimersByTimeAsync(1000)
      expect(opened).toBe(2)
      second.emit("open")
      expect(JSON.parse(second.sent[0] ?? "{}")).toMatchObject({
        payload: { resumeToken: "resume-new" },
      })
      second.message({
        _tag: "realtime.welcome",
        payload: { resumeToken: "resume-next", missedEventsDropped: false, topics: [] },
      })
      await vi.waitFor(() => expect(connected).toHaveBeenCalledTimes(2))
      expect(persisted).toEqual(["resume-new", "resume-next"])
      disconnect()
    } finally {
      vi.useRealTimers()
    }
  })

  test("closes the first-connection snapshot gap before storing its welcome cursor", async () => {
    const socket = new FakeSocket()
    const order: string[] = []
    const client = createReferenceClient({
      createWebSocket: () => socket as unknown as WebSocket,
    })
    client.connectRealtime("token", {
      onEvent: () => {},
      onDirective: () => {},
      onResync: async () => {
        order.push("resync")
      },
      onResumeToken: async () => {
        order.push("cursor")
      },
      onConnected: () => order.push("connected"),
    })
    socket.emit("open")
    socket.message({
      _tag: "realtime.welcome",
      payload: { resumeToken: "resume-first", missedEventsDropped: false, topics: [] },
    })

    await vi.waitFor(() => expect(order).toEqual(["resync", "cursor", "connected"]))
  })
})

function realtimeEvent(resumeToken: string) {
  return {
    _tag: "realtime.event",
    payload: {
      topic: RpcRealtimeTopic.Library,
      resumeToken,
      state: { _tag: "library.album.removed", payload: { id: "album-1" } },
    },
  }
}

function realtimeWelcome(resumeToken: string, missedEventsDropped = false) {
  return { _tag: "realtime.welcome", payload: { resumeToken, missedEventsDropped, topics: [] } }
}

function socketAt(sockets: readonly FakeSocket[], index: number): FakeSocket {
  const socket = sockets[index]
  if (socket === undefined) throw new Error(`socket ${index} was not opened`)
  return socket
}
