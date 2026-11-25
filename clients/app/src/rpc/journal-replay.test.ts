import { isValid } from "ulid"
import { expect, test } from "vitest"
import { CaptureContext } from "../../../../contracts/generated/pyxis"
import { assertRpcRequest } from "../../../../contracts/validation"
import { createMemoryEngine, openWorkerDatabase } from "../worker/database"
import { sync } from "../worker/sync"
import { type ListenEventInput, listenEventId, RpcError, type WorkerRpc } from "./client"

test("the outbox retains open station sessions and captures until acknowledged", async () => {
  const db = await openWorkerDatabase({ engine: createMemoryEngine() })
  await db.writeSettings({ deviceId: "phone" })
  const events: ListenEventInput[] = [
    {
      kind: "stationSession",
      event: {
        id: "01M0K000000000000000000001",
        deviceId: "phone",
        sourcePluginId: "radio",
        sessionId: "desk",
        stationId: "jazz",
        startedAt: "2026-02-02T12:00:00Z",
      },
    },
    {
      kind: "capture",
      event: {
        id: "01M0K000000000000000000002",
        deviceId: "phone",
        albumId: "heroes",
        capturedAt: "2026-02-02T12:03:00Z",
        entryContext: { origin: CaptureContext.Search },
      },
    },
  ]
  for (const event of events) await db.queueListen(event)
  const received: ListenEventInput[] = []
  let connected = false
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [],
    runSessionCommand: async () => undefined,
    async appendListen(batch) {
      if (!connected) throw new RpcError("disconnected", true)
      assertRpcRequest({ _tag: "listen.events.append", payload: { events: batch } })
      if (!batch.every((event) => isValid(listenEventId(event))))
        throw new RpcError("invalid ULID", false)
      received.push(...batch)
      return { accepted: batch.length, duplicates: 0 }
    },
  }
  expect((await sync(db, rpc)).offline).toBe(true)
  expect(
    (await db.outbox()).map((row) => (row.kind === "listen.append" ? row.event : undefined)),
  ).toEqual(events)
  connected = true
  expect((await sync(db, rpc)).pushed).toBe(2)
  expect(received).toEqual(events)
  expect(await db.outbox()).toEqual([])
})
