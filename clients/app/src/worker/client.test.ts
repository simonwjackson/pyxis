import { describe, expect, test } from "vitest"
import { RpcPlacement, RpcTransport } from "../../../../contracts/generated/pyxis"
import type { WorkerRpc } from "../rpc/client"
import {
  createDirectWorkerClient,
  createFailoverWorkerClient,
  createWorkerClient,
  type WorkerRequest,
  type WorkerResponse,
} from "./client"
import { createMemoryEngine, openWorkerDatabase } from "./database"

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
  test("an asynchronous worker startup failure switches to the network fallback", async () => {
    const worker = new FakeWorker()
    const primary = createWorkerClient(worker)
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({ bearerToken: "token", deviceId: "device-1" })
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      setPlacement: async () => undefined,
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const client = createFailoverWorkerClient(primary, () =>
      createDirectWorkerClient(
        async () => database,
        () => rpc,
      ),
    )

    const opening = client.open()
    worker.emit("error", new Error("module failed to load"))

    expect(await opening).toMatchObject({ ephemeral: true })
    expect((await client.sync()).offline).toBe(false)
    expect(worker.terminated).toBe(true)
  })

  test("failover does not abandon a durable store after a runtime worker death", async () => {
    const worker = new FakeWorker()
    let fallbacks = 0
    const client = createFailoverWorkerClient(createWorkerClient(worker), () => {
      fallbacks += 1
      return createDirectWorkerClient()
    })
    const opening = client.open()
    worker.reply({
      id: worker.sent[0]?.id ?? "",
      outcome: { status: "ready", value: { reason: "opened", version: 7 } },
    })
    await opening

    worker.emit("error", new Error("worker crashed"))

    await expect(client.albums()).rejects.toThrow("worker failed")
    expect(fallbacks).toBe(0)
  })

  test("failover does not bypass a semantic worker rejection", async () => {
    const worker = new FakeWorker()
    let fallbacks = 0
    const client = createFailoverWorkerClient(createWorkerClient(worker), () => {
      fallbacks += 1
      return createDirectWorkerClient()
    })

    const pending = client.writeSettings({ accountId: "account-2" })
    worker.reply({
      id: worker.sent[0]?.id ?? "",
      outcome: { status: "failed", message: "cannot change account while queued writes exist" },
    })

    await expect(pending).rejects.toThrow("queued writes")
    expect(fallbacks).toBe(0)
  })

  test("the browser fallback drains writes through the same sync engine", async () => {
    const database = await openWorkerDatabase({ engine: createMemoryEngine() })
    await database.writeSettings({ bearerToken: "token", deviceId: "device-1" })
    const album = {
      id: "album-1",
      title: "Heroes",
      artist: "David Bowie",
      placement: RpcPlacement.Discovery,
      placementUpdatedAt: "now",
      addedAt: "now",
      revision: 1,
      tracks: [],
    }
    await database.putAlbum(album)
    let placement = RpcPlacement.Discovery
    const rpc: WorkerRpc = {
      listAlbums: async () => [{ ...album, placement }],
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      setPlacement: async (_albumId, next) => {
        placement = next
        return { ...album, placement, revision: 2 }
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }
    const client = createDirectWorkerClient(
      async () => database,
      () => rpc,
    )
    await client.queuePlacement(album, RpcPlacement.Collection)

    const report = await client.sync()

    expect(report.pushed).toBe(1)
    expect(placement).toBe(RpcPlacement.Collection)
    expect(await database.outbox()).toEqual([])
  })

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

  test("previews a hosted command before renderer effects", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    void client.previewSessionCommand("session-1", { _tag: "transport.play", payload: {} }, "PLAY")

    expect(worker.sent[0]).toMatchObject({
      _tag: "worker.session-command.preview",
      payload: {
        sessionId: "session-1",
        commandId: "PLAY",
        command: { _tag: "transport.play" },
      },
    })
  })

  test("sends a hosted session command to the worker queue", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    void client.queueSessionCommand(
      {
        id: "session-1",
        name: "Browser",
        hostDeviceId: "device-1",
        queue: [],
        transport: RpcTransport.Stopped,
        positionMs: 0,
        volume: 100,
        reachable: true,
        revision: 1,
        updatedAt: "now",
      },
      { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
      "COMMAND",
      1,
    )

    expect(worker.sent[0]).toMatchObject({
      _tag: "worker.queue.session-command",
      payload: {
        session: { id: "session-1" },
        commandId: "COMMAND",
        expectedRevision: 1,
        command: { _tag: "queue.add" },
      },
    })
  })

  test("sends a listen to the worker queue instead of the network", async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient(worker)

    void client.queueListen({
      id: "01LISTEN",
      trackId: "track-1",
      deviceId: "device-1",
      listenedAt: "2026-06-01T00:00:00Z",
      completed: true,
      context: "queue",
    })

    expect(worker.sent[0]).toMatchObject({
      _tag: "worker.queue.listen",
      payload: { event: { id: "01LISTEN", trackId: "track-1" } },
    })
  })
})
