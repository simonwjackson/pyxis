import { describe, expect, it, vi } from "vitest"
import {
  type RpcRequest,
  type RpcSession,
  RpcTransport as RpcTransportKind,
} from "../../../../contracts/generated/pyxis"
import { createRpcTransport } from "./transport.ts"

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "This device",
  hostDeviceId: "device-1",
  queue: [],
  transport: RpcTransportKind.Stopped,
  positionMs: 0,
  volume: 50,
  reachable: true,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
})

/// A fetch double that records what was asked and answers with a chosen body.
const transportWith = (body: unknown, init: { status?: number } = {}) => {
  const calls: { url: string; init?: RequestInit }[] = []
  const request = vi.fn(async (url: string, requestInit?: RequestInit) => {
    calls.push({ url, ...(requestInit === undefined ? {} : { init: requestInit }) })
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    })
  })
  return { rpc: createRpcTransport({ request }), calls, request }
}

const sentBody = (calls: { init?: RequestInit }[]): RpcRequest =>
  JSON.parse(String(calls[0]?.init?.body)) as RpcRequest

describe("claiming a device", () => {
  it("returns the core's answer whole rather than collapsing its refusals", async () => {
    // Two different refusals that need different responses from a person: one is solved by
    // pairing, the other by waiting. Flattening them here is what forces the layers above
    // to parse strings to tell them apart.
    const refused = transportWith({
      _tag: "auth.device.claim",
      outcome: { status: "pairingRequired" },
    })
    expect(await refused.rpc.claimDevice("Chrome on Linux")).toEqual({
      status: "pairingRequired",
    })

    const broken = transportWith({
      _tag: "auth.device.claim",
      outcome: {
        status: "unavailable",
        value: { code: "core.down", message: "not now", retryable: true },
      },
    })
    const outcome = await broken.rpc.claimDevice("Chrome on Linux")
    expect(outcome.status).toBe("unavailable")
    expect(outcome.status === "unavailable" && outcome.value.retryable).toBe(true)
  })

  it("asks without a credential, because this is the call that obtains one", async () => {
    const { rpc, calls } = transportWith({
      _tag: "auth.device.claim",
      outcome: { status: "pairingRequired" },
    })
    await rpc.claimDevice("Chrome on Linux")

    expect(calls[0]?.url).toBe("/rpc")
    expect(sentBody(calls)).toEqual({
      _tag: "auth.device.claim",
      payload: { name: "Chrome on Linux" },
    })
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })
})

describe("a response that is not the answer to the question", () => {
  it("refuses a body tagged as a different call", async () => {
    // Reading a payload off a mismatched response means reading the wrong shape, and the
    // failure would surface much later as a nonsensical value.
    const { rpc } = transportWith({ _tag: "session.list", outcome: { status: "ready", value: [] } })
    await expect(rpc.claimDevice("Chrome")).rejects.toThrow(
      "RPC answered 'session.list' when asked 'auth.device.claim'",
    )
  })

  it("reports the core's own explanation when it rejects the request", async () => {
    const { rpc } = transportWith({
      _tag: "rpc.failure",
      outcome: { status: "unavailable", value: { code: "bad.request", message: "malformed" } },
    })
    await expect(rpc.claimDevice("Chrome")).rejects.toThrow("bad.request: malformed")
  })

  it("separates a transport failure from a protocol answer", async () => {
    const { rpc } = transportWith({}, { status: 502 })
    await expect(rpc.claimDevice("Chrome")).rejects.toThrow("failed with HTTP 502")
  })

  it("does not crash on a failure whose explanation is the wrong shape", async () => {
    const { rpc } = transportWith({ _tag: "rpc.failure", outcome: { value: 42 } })
    await expect(rpc.claimDevice("Chrome")).rejects.toThrow("was rejected")
  })
})

describe("running a session command", () => {
  it("carries the credential and returns the session the core applied it to", async () => {
    const applied = session({ revision: 2 })
    const { rpc, calls } = transportWith({
      _tag: "session.command.run",
      outcome: { status: "applied", value: applied },
    })

    const result = await rpc.runCommand("token-1", "session-1", {
      _tag: "queue.add",
      payload: { trackIds: ["a-t1"] },
    })

    expect(result).toEqual(applied)
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer token-1")
    expect(sentBody(calls)).toEqual({
      _tag: "session.command.run",
      payload: {
        sessionId: "session-1",
        command: { _tag: "queue.add", payload: { trackIds: ["a-t1"] } },
      },
    })
  })

  it("names every way a command failed to take effect", async () => {
    // A command that did not apply must never be mistaken for one that did, or the
    // interface shows a queue the core never accepted.
    const cases: readonly (readonly [string, string])[] = [
      ["unknownSession", "does not know this session"],
      ["notHost", "does not host that session"],
      ["notDevice", "not a device"],
    ]
    for (const [status, expected] of cases) {
      const { rpc } = transportWith({ _tag: "session.command.run", outcome: { status } })
      await expect(
        rpc.runCommand("token-1", "session-1", { _tag: "transport.play", payload: {} }),
      ).rejects.toThrow(expected)
    }
  })

  it("reports a rejection with the core's reason", async () => {
    const { rpc } = transportWith({
      _tag: "session.command.run",
      outcome: {
        status: "rejected",
        value: { code: "queue.empty", message: "nothing to play", retryable: false },
      },
    })
    await expect(
      rpc.runCommand("token-1", "session-1", { _tag: "transport.play", payload: {} }),
    ).rejects.toThrow("queue.empty: nothing to play")
  })
})

describe("sessions", () => {
  it("asks only for sessions a command could reach", async () => {
    const { rpc, calls } = transportWith({
      _tag: "session.list",
      outcome: { status: "ready", value: [session()] },
    })
    const sessions = await rpc.listSessions("token-1")

    expect(sessions).toHaveLength(1)
    expect(sentBody(calls)).toEqual({
      _tag: "session.list",
      payload: { includeUnreachable: false },
    })
  })

  it("says plainly when a credential cannot host a session", async () => {
    const { rpc } = transportWith({ _tag: "session.create", outcome: { status: "notDevice" } })
    await expect(rpc.createSession("token-1", "This device")).rejects.toThrow(
      "not a device, so it cannot host a session",
    )
  })
})
