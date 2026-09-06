import { afterEach, describe, expect, test, vi } from "vitest"
import type { WorkerRequest, WorkerResponse } from "./client"
import { WORKER_SCHEMA_VERSION } from "./contract"
import { createMemoryEngine } from "./database"

const mocks = vi.hoisted(() => ({ createEngine: vi.fn() }))
vi.mock("./proseql-engine", () => ({ createProseqlEngine: mocks.createEngine }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.createEngine.mockReset()
  vi.resetModules()
})

async function worker() {
  let receive: ((event: { data: WorkerRequest }) => void) | undefined
  const pending = new Map<string, (value: WorkerResponse) => void>()
  vi.stubGlobal("self", {
    addEventListener: (_type: string, handler: typeof receive) => {
      receive = handler
    },
    postMessage: (value: WorkerResponse) => {
      pending.get(value.id)?.(value)
      pending.delete(value.id)
    },
  })
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  await import("./entry")
  return (request: WorkerRequest) =>
    new Promise<WorkerResponse>((resolve) => {
      pending.set(request.id, resolve)
      receive?.({ data: request })
    })
}

function blockedHandle() {
  const engine = createMemoryEngine()
  engine.meta.upsert = async () => {
    throw new Error("quota exhausted")
  }
  const close = vi.fn(async () => undefined)
  return { engine: { ...engine, close }, clear: async () => undefined, close }
}

describe("persistent worker startup ownership", () => {
  test("rejects startup rather than returning an ephemeral engine that each lock discards", async () => {
    const blocked = blockedHandle()
    mocks.createEngine.mockResolvedValue(blocked)
    const send = await worker()
    const response = await send({ id: "open", _tag: "worker.open" })
    expect(response.outcome.status).toBe("failed")
    expect(blocked.close).toHaveBeenCalled()
  })

  test("a runtime reopen failure cannot turn durable storage into a fresh memory database", async () => {
    const durable = createMemoryEngine()
    await durable.meta.upsert({ id: "schema", version: WORKER_SCHEMA_VERSION })
    const blocked = blockedHandle()
    mocks.createEngine
      .mockResolvedValueOnce({ engine: durable, clear: async () => undefined })
      .mockResolvedValue(blocked)
    const send = await worker()
    expect((await send({ id: "open", _tag: "worker.open" })).outcome.status).toBe("ready")
    const response = await send({ id: "read", _tag: "worker.settings.read" })
    expect(response.outcome.status).toBe("failed")
    expect(blocked.close).toHaveBeenCalled()
  })
})
