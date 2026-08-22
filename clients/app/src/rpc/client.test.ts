import { describe, expect, test, vi } from "vitest"
import { RpcPlacement, RpcTransport } from "../../../../contracts/generated/pyxis"
import { createWorkerRpc } from "./client"

const SESSION = {
  id: "session-1",
  name: "Browser",
  hostDeviceId: "device-1",
  queue: ["track-1"],
  cursor: 0,
  currentTrackId: "track-1",
  streamPath: "/stream/track-1",
  transport: RpcTransport.Stopped,
  positionMs: 0,
  volume: 100,
  reachable: true,
  revision: 2,
  updatedAt: "now",
}

describe("worker session RPC", () => {
  test("sends the outbox id as the session command idempotency key", async () => {
    let body: unknown
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          _tag: "session.command.run",
          outcome: { status: "applied", value: SESSION },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const rpc = createWorkerRpc({
      token: "token",
      fetch: request as unknown as typeof fetch,
    })

    const updated = await rpc.runSessionCommand(
      "session-1",
      { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
      "01COMMAND",
    )

    expect(updated).toEqual(SESSION)
    expect(body).toMatchObject({
      _tag: "session.command.run",
      payload: { sessionId: "session-1", commandId: "01COMMAND" },
    })
  })

  test("times out a pull that never answers", async () => {
    const request = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )
    const rpc = createWorkerRpc({
      token: "token",
      timeoutMs: 5,
      fetch: request as unknown as typeof fetch,
    })

    await expect(rpc.listAlbums()).rejects.toThrow("timed out after 5ms")
  })

  test("rejects listen counts that do not account for the submitted batch", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            _tag: "listen.events.append",
            outcome: { status: "ready", value: { accepted: 0, duplicates: 0 } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const rpc = createWorkerRpc({
      token: "token",
      fetch: request as unknown as typeof fetch,
    })

    await expect(
      rpc.appendListen([
        {
          id: "01LISTEN",
          trackId: "track-1",
          deviceId: "device-1",
          listenedAt: "now",
          completed: true,
          context: "queue",
        },
      ]),
    ).rejects.toMatchObject({
      message: expect.stringContaining("did not account"),
      retryable: true,
    })
  })

  test("treats a malformed write response as uncertain and retryable", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            _tag: "library.album.command.run",
            outcome: { status: "applied", value: { id: "album-1" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const rpc = createWorkerRpc({
      token: "token",
      fetch: request as unknown as typeof fetch,
    })

    await expect(rpc.setPlacement("album-1", RpcPlacement.Collection)).rejects.toMatchObject({
      retryable: true,
    })
  })

  test("rejects a malformed session before it reaches storage", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            _tag: "session.list",
            outcome: { status: "ready", value: [{ id: "session-1" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const rpc = createWorkerRpc({
      token: "token",
      fetch: request as unknown as typeof fetch,
    })

    await expect(rpc.listSessions()).rejects.toThrow("identity, queue, or revision")
  })
})
