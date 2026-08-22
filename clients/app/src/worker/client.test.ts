import { describe, expect, test } from "vitest"
import { createWorkerClient, type WorkerRequest, type WorkerResponse } from "./client"

/// A stand-in for a real Worker, so failure modes can be provoked deliberately.
class FakeWorker {
  readonly sent: WorkerRequest[] = []
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
  terminated = false

  postMessage(message: WorkerRequest): void {
    this.sent.push(message)
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener as (event: unknown) => void)
    this.listeners.set(type, existing)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  reply(response: WorkerResponse): void {
    this.emit("message", { data: response })
  }
}

describe("worker client", () => {
  test("correlates concurrent replies by request id", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    const albums = client.albums()
    const settings = client.settings()
    const [albumsRequest, settingsRequest] = worker.sent

    // Reply out of order to prove the id decides, not arrival.
    worker.reply({
      id: settingsRequest?.id ?? "",
      outcome: { status: "ready", value: { id: "device" } },
    })
    worker.reply({ id: albumsRequest?.id ?? "", outcome: { status: "ready", value: [] } })

    expect(await albums).toEqual([])
    expect(await settings).toEqual({ id: "device" })
  })

  test("a failure outcome rejects with the worker's message", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    const pending = client.albums()
    worker.reply({
      id: worker.sent[0]?.id ?? "",
      outcome: { status: "failed", message: "database is closed" },
    })

    await expect(pending).rejects.toThrow("database is closed")
  })

  test("a dead worker rejects everything in flight instead of hanging", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    const pending = client.albums()
    worker.emit("error", new Error("worker crashed"))

    await expect(pending).rejects.toThrow("the local store worker failed")
  })

  test("terminating rejects outstanding requests", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    const pending = client.settings()
    client.terminate()

    await expect(pending).rejects.toThrow("stopped")
    expect(worker.terminated).toBe(true)
  })

  test("a request made after the worker died fails instead of hanging", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)
    worker.emit("error", new Error("worker crashed"))

    await expect(client.albums()).rejects.toThrow("the local store worker failed")
  })

  test("a missing album stays undefined rather than becoming null", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    const pending = client.album("nope")
    worker.reply({ id: worker.sent[0]?.id ?? "", outcome: { status: "ready", value: undefined } })

    expect(await pending).toBeUndefined()
  })

  test("a single album lookup does not transfer the whole library", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    void client.album("album-1")

    expect(worker.sent[0]).toMatchObject({
      _tag: "worker.album.read",
      payload: { id: "album-1" },
    })
  })
})
