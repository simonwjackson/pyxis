import { expect, test } from "vitest"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { sync } from "./sync"

test("unknown persisted intent remains durable and reports an explicit update blocker", async () => {
  const engine = createMemoryEngine()
  const database = await openWorkerDatabase({ engine })
  const retained = JSON.parse(
    '{"id":"old-write","kind":"retired.command","attempts":0,"createdAt":"2026-01-01","payload":{"important":"intent"}}',
  )
  await engine.outbox.upsert(retained)
  const report = await sync(database, {
    listAlbums: async () => [],
    listSessions: async () => [],
    runSessionCommand: async () => {
      throw new Error("must not send unsupported intent")
    },
    appendListen: async () => {
      throw new Error("must not send unsupported intent")
    },
  })
  expect(report.deferred).toBe(1)
  expect(report.failure).toContain("unsupported queued write retained")
  expect(await database.outbox()).toEqual([retained])
  await database.close()
  const reopened = await openWorkerDatabase({ engine })
  expect(await reopened.outbox()).toEqual([retained])
})
