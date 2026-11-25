// @vitest-environment node
import { once } from "node:events"
import { createServer } from "node:http"
import { json } from "node:stream/consumers"
import * as Option from "effect/Option"
import { describe, expect, onTestFinished, test } from "vitest"
import {
  RPC_CONTRACT_ID,
  RpcRepeatMode,
  type RpcResponse,
  type RpcSession,
  RpcTransport,
  type SessionHandoffOutcome,
  type SessionHandoffRequest,
} from "../../../../contracts/generated/pyxis"
import { assertRpcRequest } from "../../../../contracts/validation"
import { createSupportRpc } from "../rpc/support"
import { createDirectWorkerClient, createLeanBackClient } from "./client"

// Node's fetch says "fetch failed"; Bun's says "Unable to connect".
const connectionLost = /fetch failed|unable to connect/i
const deviceId = "phone"
const bearerToken = "phone-token"

function session(id: string, overrides: Partial<RpcSession> = {}): RpcSession {
  return {
    id,
    name: id,
    hostDeviceId: deviceId,
    repeat: RpcRepeatMode.Off,
    shuffle: false,
    queue: ["first", "second"],
    cursor: 1,
    currentTrackId: "second",
    transport: RpcTransport.Playing,
    positionMs: 4200,
    volume: 50,
    reachable: true,
    revision: 2,
    updatedAt: "2026-11-23T10:00:00Z",
    ...overrides,
  }
}

async function pairedWorker() {
  const worker = createDirectWorkerClient()
  await worker.open()
  await worker.writeSettings({ deviceId, bearerToken, accountId: "default" })
  return worker
}

// A loopback peer for the two requests lean-back sends. Session membership can change
// between list calls without changing the worker's local store.
async function sessionEndpoint(seed: RpcSession[] = [], handoffOutcome?: SessionHandoffOutcome) {
  const sessions = new Map(seed.map((row) => [row.id, row]))
  const handoffs: SessionHandoffRequest[] = []
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/rpc") {
      response.writeHead(404).end()
      return
    }
    if (
      request.headers.authorization !== `Bearer ${bearerToken}` ||
      request.headers["x-pyxis-contract"] !== RPC_CONTRACT_ID
    ) {
      response.writeHead(403).end()
      return
    }
    try {
      const operation = await json(request)
      assertRpcRequest(operation)
      let reply: RpcResponse
      if (operation._tag === "session.list") {
        reply = {
          _tag: operation._tag,
          outcome: {
            status: "ready",
            value: [...sessions.values()].filter(
              (row) => operation.payload.includeUnreachable || row.reachable,
            ),
          },
        }
      } else if (operation._tag === "session.handoff" && handoffOutcome !== undefined) {
        handoffs.push(operation.payload)
        reply = { _tag: operation._tag, outcome: handoffOutcome }
      } else {
        response.writeHead(400).end()
        return
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply))
    } catch {
      response.writeHead(400).end()
    }
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("expected TCP listener")
  const origin = `http://127.0.0.1:${address.port}`
  const close = async () => {
    if (!server.listening) return
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
  onTestFinished(close)
  return {
    rpc: createSupportRpc((path, init) => fetch(new URL(String(path), origin), init)),
    retire: (id: string) => sessions.delete(id),
    handoffs,
    close,
  }
}

describe("lean-back host API", () => {
  test("resumes the local sounding queue, cursor and position without a connection", async () => {
    const worker = await pairedWorker()
    const sounding = session("a", { reachable: false })
    await worker.putSession(sounding)
    await worker.putSession(
      session("b", { transport: RpcTransport.Paused, updatedAt: "2026-11-24T10:00:00Z" }),
    )
    await worker.putSession(session("c", { hostDeviceId: "laptop" }))
    expect(await createLeanBackClient(worker).resumeForDevice()).toEqual(Option.some(sounding))
  })

  test("offline resume excludes a local session after its retirement is applied", async () => {
    const worker = await pairedWorker()
    const local = session("phone-session", { reachable: false })
    await worker.putSession(local)
    const host = createLeanBackClient(worker)
    expect(await host.resumeForDevice()).toEqual(Option.some(local))
    await worker.applySessionRetirement(local.id)
    expect(await host.resumeForDevice()).toEqual(Option.none())
  })

  test.each([
    ["a", "b", "z"],
    ["z", "b", "a"],
  ])("quiet sessions use update time then id, not store order (%s, %s, %s)", async (...ids) => {
    const worker = await pairedWorker()
    for (const id of ids) {
      await worker.putSession(
        session(id, {
          transport: RpcTransport.Paused,
          updatedAt: id === "z" ? "2026-11-22T10:00:00Z" : "2026-11-23T10:00:00Z",
        }),
      )
    }
    const resumed = await createLeanBackClient(worker).resumeForDevice()
    expect(Option.map(resumed, (row) => row.id)).toEqual(Option.some("b"))
  })

  test("a device with no local session never resumes another host", async () => {
    const worker = await pairedWorker()
    await worker.putSession(session("laptop-session", { hostDeviceId: "laptop" }))
    expect(await createLeanBackClient(worker).resumeForDevice()).toEqual(Option.none())
  })

  test("only reachable mid-session devices from the latest session.list are candidates", async () => {
    const worker = await pairedWorker()
    const remote = (id: string, overrides?: Partial<RpcSession>) =>
      session(id, { hostDeviceId: "laptop", ...overrides })
    // A retired session can still be in the worker until sync; the core no longer lists it.
    await worker.putSession(remote("retired"))
    const playing = remote("playing")
    const paused = remote("paused", { transport: RpcTransport.Paused })
    const endpoint = await sessionEndpoint([
      remote("retired"),
      session("local"),
      playing,
      paused,
      remote("unreachable", { reachable: false }),
      remote("idle", { transport: RpcTransport.Stopped }),
      remote("finished", { transport: RpcTransport.Ended }),
      remote("speaker", { output: { pluginId: "sonos", targetId: "room" } }),
    ])
    const host = createLeanBackClient(worker, endpoint.rpc)
    expect(await host.takeoverCandidates()).toEqual([remote("retired"), playing, paused])
    expect(endpoint.retire("retired")).toBe(true)
    expect(await host.takeoverCandidates()).toEqual([playing, paused])
  })

  test("a lost connection rejects discovery and handoff instead of reporting no sessions", async () => {
    const worker = await pairedWorker()
    const endpoint = await sessionEndpoint()
    const host = createLeanBackClient(worker, endpoint.rpc)
    await endpoint.close()
    await expect(host.takeoverCandidates()).rejects.toThrow(connectionLost)
    await expect(host.handoff({ sessionId: "remote", targetSessionId: "local" })).rejects.toThrow(
      connectionLost,
    )
  })

  test("handoff sends the selected source and target once and returns the core's refusal", async () => {
    const worker = await pairedWorker()
    const payload = { sessionId: "laptop-session", targetSessionId: "phone-session" }
    const endpoint = await sessionEndpoint([], { status: "targetBusy" })
    expect(await createLeanBackClient(worker, endpoint.rpc).handoff(payload)).toEqual({
      status: "targetBusy",
    })
    expect(endpoint.handoffs).toEqual([payload])
  })
})
