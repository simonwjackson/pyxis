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

describe("reference realtime client", () => {
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
    })
    socket.emit("open")
    socket.message({
      _tag: "realtime.welcome",
      payload: { resumeToken: "resume-first", missedEventsDropped: false, topics: [] },
    })

    await vi.waitFor(() => expect(order).toEqual(["resync", "cursor"]))
  })
})
