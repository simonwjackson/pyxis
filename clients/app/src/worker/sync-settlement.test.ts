import { expect, test } from "vitest"
import { RpcRepeatMode, type RpcSession, RpcTransport } from "../../../../contracts/generated/pyxis"
import { RpcError, type WorkerRpc } from "../rpc/client"
import { accountFencedDatabase } from "./account-fenced-database"
import type { WorkerOutboxEntry } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { browserOfflineExclusive } from "./downloads"
import { sync } from "./sync"

function listen(id: string): WorkerOutboxEntry {
  return {
    id,
    kind: "listen.append",
    attempts: 0,
    createdAt: "2026-09-30",
    event: {
      id: `event-${id}`,
      trackId: "track-1",
      deviceId: "device-1",
      listenedAt: "2026-09-30",
      completed: true,
      context: "queue",
    },
  }
}

function session(): RpcSession {
  return {
    id: "session-1",
    name: "Browser",
    hostDeviceId: "device-1",
    repeat: RpcRepeatMode.Off,
    shuffle: false,
    queue: [],
    transport: RpcTransport.Stopped,
    positionMs: 0,
    volume: 100,
    reachable: true,
    revision: 1,
    updatedAt: "2026-09-30T00:00:00Z",
  }
}

test("an accepted command survives a local verdict failure and replays without duplication", async () => {
  const engine = createMemoryEngine()
  const store = await openWorkerDatabase({ engine })
  let remote = session()
  await store.putSession(remote)
  await store.queueSessionCommand(
    remote,
    { _tag: "queue.add", payload: { trackIds: ["track-1"] } },
    "command-1",
  )
  let failSave = false
  const save = engine.sessions.upsert.bind(engine.sessions)
  engine.sessions.upsert = async (row) => {
    if (failSave) {
      failSave = false
      throw new Error("configured local verdict failure")
    }
    return save(row)
  }
  const accepted = new Set<string>()
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [remote],
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    async runSessionCommand(_id, command, commandId) {
      if (command._tag !== "queue.add") throw new Error("unexpected command")
      if (!accepted.has(commandId)) {
        accepted.add(commandId)
        remote = { ...remote, queue: ["track-1"], revision: 2 }
        failSave = true
      }
      return remote
    },
  }

  const first = await sync(store, rpc, "sessions")

  expect(first.dropped).toEqual([])
  expect(first.deferred).toBe(1)
  expect((await store.session(remote.id))?.queue).toEqual(["track-1"])
  expect((await store.settings()).syncNotices ?? []).toEqual([])
  expect(await store.outbox()).toMatchObject([
    { commandId: "command-1", attempts: 1, lastError: "configured local verdict failure" },
  ])

  const retry = await sync(store, rpc, "sessions")

  expect(retry).toMatchObject({ pushed: 1, deferred: 0, dropped: [] })
  expect(accepted.size).toBe(1)
  expect(remote.queue).toEqual(["track-1"])
  expect((await store.session(remote.id))?.queue).toEqual(["track-1"])
  expect(await store.outbox()).toEqual([])
  await store.close()
})

test("settlement repairs receipts for remaining commands whose optimistic result changed", async () => {
  const engine = createMemoryEngine()
  const store = await openWorkerDatabase({ engine })
  const remote = session()
  await store.putSession(remote)
  const first = await store.queueSessionCommand(
    remote,
    { _tag: "queue.add", payload: { trackIds: ["first"] } },
    "first-command",
  )
  const command = { _tag: "queue.add" as const, payload: { trackIds: ["second"] } }
  await store.queueSessionCommand(first, command, "second-command")
  await engine.commandReceipts.delete("session-1:second-command")
  const [entry] = await store.outbox()
  if (entry === undefined) throw new Error("missing first command")

  await store.settleOutbox(entry.id, {
    _tag: "Settle",
    verdict: {
      _tag: "SessionAccepted",
      session: { ...remote, queue: ["first"], revision: 2, updatedAt: "server-time" },
    },
  })

  const current = await store.session(remote.id)
  if (current === undefined) throw new Error("missing session")
  const repaired = await store.queueSessionCommand(current, command, "second-command")
  expect(repaired.queue).toEqual(["first", "second"])
  expect(await store.previewSessionCommand(remote.id, command, "second-command")).toMatchObject({
    replayed: true,
  })
  await store.close()
})

test("receipt persistence failure cannot duplicate a replayed command on redelivery", async () => {
  const engine = createMemoryEngine()
  const store = await openWorkerDatabase({ engine })
  const remote = session()
  await store.putSession(remote)
  const first = await store.queueSessionCommand(
    remote,
    { _tag: "queue.add", payload: { trackIds: ["first"] } },
    "first-command",
  )
  const command = { _tag: "queue.add" as const, payload: { trackIds: ["second"] } }
  await store.queueSessionCommand(first, command, "second-command")
  await engine.commandReceipts.delete("session-1:second-command")
  const save = engine.commandReceipts.upsert.bind(engine.commandReceipts)
  let fail = true
  engine.commandReceipts.upsert = async (row) => {
    if (fail) {
      fail = false
      throw new Error("configured receipt failure")
    }
    return save(row)
  }
  const [entry] = await store.outbox()
  if (entry === undefined) throw new Error("missing first command")
  expect(
    await store.settleOutbox(entry.id, {
      _tag: "Settle",
      verdict: {
        _tag: "SessionAccepted",
        session: { ...remote, queue: ["first"], revision: 2, updatedAt: "server-time" },
      },
    }),
  ).toMatchObject({ outcome: "deferred", reason: "storage" })

  const current = await store.session(remote.id)
  if (current === undefined) throw new Error("missing session")
  expect((await store.queueSessionCommand(current, command, "second-command")).queue).toEqual([
    "first",
    "second",
  ])
  expect(await store.settleOutbox(entry.id, { _tag: "Resume" })).toMatchObject({
    outcome: "pushed",
  })
  expect((await store.session(remote.id))?.queue).toEqual(["first", "second"])
  await store.close()
})

test.each(["auth", "network"])(
  "permanent rejection text %s is not a transport status",
  async (reason) => {
    const store = await openWorkerDatabase({ engine: createMemoryEngine() })
    const remote = session()
    await store.putSession(remote)
    const first = await store.queueSessionCommand(
      remote,
      { _tag: "queue.add", payload: { trackIds: ["first"] } },
      "first-command",
    )
    await store.queueSessionCommand(
      first,
      { _tag: "queue.add", payload: { trackIds: ["second"] } },
      "second-command",
    )
    let calls = 0
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [remote],
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
      async runSessionCommand() {
        calls += 1
        if (calls === 1) throw new RpcError(reason, false)
        return { ...remote, queue: ["second"], revision: 2 }
      },
    }

    const report = await sync(store, rpc, "sessions")

    expect(report).toMatchObject({ authRequired: false, offline: false, deferred: 0, pushed: 1 })
    expect(report.dropped).toMatchObject([{ reason }])
    expect(calls).toBe(2)
    await store.close()
  },
)

test("resuming an accepted command does not restore an obsolete server snapshot", async () => {
  const engine = createMemoryEngine()
  const store = await openWorkerDatabase({ engine })
  const remote = session()
  await store.putSession(remote)
  await store.queueSessionCommand(
    remote,
    { _tag: "queue.add", payload: { trackIds: ["first"] } },
    "first-command",
  )
  const [entry] = await store.outbox()
  if (entry === undefined) throw new Error("missing queued command")
  await store.enqueue({
    ...entry,
    settlement: { _tag: "SessionAccepted", session: { ...remote, queue: ["first"], revision: 2 } },
  })
  let calls = 0
  const latest = { ...remote, queue: ["other-device-edit"], revision: 3 }
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [latest],
    async runSessionCommand() {
      calls += 1
      return latest
    },
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
  }

  const report = await sync(store, rpc, "sessions")

  expect(calls).toBe(0)
  expect(report).toMatchObject({ pushed: 1, deferred: 0, dropped: [] })
  expect(await store.session(remote.id)).toEqual(latest)
  await store.close()
})

test.each([false, true])(
  "multiple saved verdicts never replay accepted commands again (offline=%s)",
  async (offline) => {
    const engine = createMemoryEngine()
    const store = await openWorkerDatabase({ engine })
    const remote = session()
    await store.putSession(remote)
    const first = await store.queueSessionCommand(
      remote,
      { _tag: "queue.add", payload: { trackIds: ["first"] } },
      "first-command",
    )
    await store.queueSessionCommand(
      first,
      { _tag: "queue.add", payload: { trackIds: ["second"] } },
      "second-command",
    )
    const entries = await store.outbox()
    const latest = { ...remote, queue: ["first", "second"], revision: 3 }
    for (const [index, entry] of entries.entries()) {
      await store.enqueue({
        ...entry,
        settlement: {
          _tag: "SessionAccepted",
          session: index === 0 ? { ...remote, queue: ["first"], revision: 2 } : latest,
        },
      })
    }
    const prior = await engine.sessions.findById(remote.id)
    const published: (typeof latest.queue)[] = []
    const save = engine.sessions.upsert.bind(engine.sessions)
    engine.sessions.upsert = async (row) => {
      if (!offline && published.length === 0) {
        // The pull durably fences timer state before either verdict settles. Only
        // its core revision may change; no historical playback can be published.
        expect(row).toEqual({ ...prior, timerAuthority: { revision: latest.revision } })
      }
      published.push([...row.queue])
      return save(row)
    }
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      async listSessions() {
        if (offline) throw new RpcError("offline", true)
        return [latest]
      },
      runSessionCommand: async () => {
        throw new Error("saved verdict must not repeat RPC")
      },
      appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    }

    const report = await sync(store, rpc, "sessions")

    expect(report).toMatchObject({ pushed: 2, deferred: 0, dropped: [], offline })
    expect(published).toEqual([
      ...(offline ? [] : [["first", "second"]]),
      ["first", "second"],
      ["first", "second"],
    ])
    expect((await store.session(remote.id))?.queue).toEqual(["first", "second"])
    await store.close()
  },
)

test.each(["accepted", "rejected"] as const)(
  "a locally unsettled %s listen stays retryable",
  async (outcome) => {
    const engine = createMemoryEngine()
    const store = await openWorkerDatabase({ engine })
    const entry = listen("listen-1")
    await store.enqueue(entry)
    let calls = 0
    let fail = true
    const remove = engine.outbox.delete.bind(engine.outbox)
    const save = engine.settings.upsert.bind(engine.settings)
    engine.outbox.delete = async (id) => {
      if (outcome === "accepted" && fail) {
        fail = false
        throw new Error("configured dequeue failure")
      }
      return remove(id)
    }
    engine.settings.upsert = async (row) => {
      if (outcome === "rejected" && fail && row.syncNotices !== undefined) {
        fail = false
        throw new Error("configured notice failure")
      }
      return save(row)
    }
    const rpc: WorkerRpc = {
      listAlbums: async () => [],
      listSessions: async () => [],
      runSessionCommand: async () => undefined,
      async appendListen() {
        calls += 1
        if (outcome === "rejected") throw new RpcError("invalid listen", false)
        return { accepted: 1, duplicates: 0 }
      },
    }

    expect(await sync(store, rpc)).toMatchObject({ deferred: 1, dropped: [], offline: false })
    expect(await store.outbox()).toHaveLength(1)
    const retry = await sync(store, rpc)

    expect(calls).toBe(1)
    expect(retry.deferred).toBe(0)
    expect(retry.dropped).toEqual(
      outcome === "rejected" ? [{ id: entry.id, reason: "invalid listen" }] : [],
    )
    expect((await store.settings()).syncNotices ?? []).toEqual(
      outcome === "rejected"
        ? [
            {
              id: `dropped:${entry.id}`,
              kind: "dropped",
              writeId: entry.id,
              reason: "invalid listen",
            },
          ]
        : [],
    )
    await store.close()
  },
)

test("concurrent settlements retain both notices and keep the newest 100", async () => {
  const store = await openWorkerDatabase({ engine: createMemoryEngine() })
  await store.writeSettings({
    syncNotices: Array.from({ length: 99 }, (_, index) => ({
      id: `old:${index}`,
      kind: "dropped" as const,
      writeId: `old:${index}`,
      reason: "older refusal",
    })),
  })
  await store.enqueue(listen("first"))
  await store.enqueue(listen("second"))

  const results = await Promise.all(
    ["first", "second"].map((id) =>
      store.settleOutbox(id, {
        _tag: "Settle",
        verdict: { _tag: "Rejected", reason: "server refusal" },
      }),
    ),
  )

  expect(results.map((result) => result.outcome)).toEqual(["dropped", "dropped"])
  const notices = (await store.settings()).syncNotices ?? []
  expect(notices).toHaveLength(100)
  expect(notices.at(0)?.id).toBe("old:1")
  expect(notices.slice(-2).map((notice) => notice.id)).toEqual(["dropped:first", "dropped:second"])
  expect(await store.outbox()).toEqual([])
  await store.close()
})

test("an account switch during RPC refuses settlement without writing into the new account", async () => {
  const first = await openWorkerDatabase({ engine: createMemoryEngine() })
  const second = await openWorkerDatabase({ engine: createMemoryEngine() })
  await first.writeSettings({ accountId: "first" })
  await second.writeSettings({ accountId: "second" })
  const remote = session()
  await first.putSession(remote)
  await first.queueSessionCommand(
    remote,
    { _tag: "queue.add", payload: { trackIds: ["first-account"] } },
    "command-1",
  )
  const exclusive = browserOfflineExclusive(undefined)
  let current = first
  const fenced = accountFencedDatabase(first, "first", (operation) =>
    exclusive(() => operation(current)),
  )
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [remote],
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    async runSessionCommand() {
      current = second
      return { ...remote, queue: ["first-account"], revision: 2 }
    },
  }

  await expect(sync(fenced, rpc, "sessions")).rejects.toThrow(
    "account changed while sync was in flight",
  )
  expect(await first.outbox()).toHaveLength(1)
  expect(await second.outbox()).toEqual([])
  expect(await second.sessions()).toEqual([])
  expect((await second.settings()).syncNotices ?? []).toEqual([])
  await first.close()
  await second.close()
})

test("a cancelled timer Stop with an interrupted projection settles and drains the next command", async () => {
  const engine = createMemoryEngine()
  const store = await openWorkerDatabase({ engine })
  const playing = { ...session(), queue: ["track"], transport: RpcTransport.Playing }
  const armed = {
    ...playing,
    sleepTimer: { id: "bed", deadline: "2099-01-01T00:00:00Z", fadeSeconds: 0 },
  }
  const other = { ...session(), id: "other" }
  await store.putSession(armed)
  await store.putSession(other)
  const save = engine.sessions.upsert.bind(engine.sessions)
  engine.sessions.upsert = async () => {
    throw new Error("projection write interrupted")
  }
  const stop = { _tag: "transport.stop", payload: { sleepTimerId: "bed" } } as const
  await expect(store.queueSessionCommand(armed, stop, "sleep:bed")).rejects.toThrow(
    "projection write interrupted",
  )
  engine.sessions.upsert = save
  const cancelled = { ...playing, revision: 2 }
  await store.applyRemoteSession(cancelled)
  const volume = { _tag: "volume.set", payload: { volume: 64 } } as const
  await store.queueSessionCommand(other, volume, "turn-down")
  const sent: string[] = []
  const rpc: WorkerRpc = {
    listSessions: async () => [cancelled, other],
    listAlbums: async () => [],
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
    async runSessionCommand(id, command, key) {
      sent.push(key)
      if (id === armed.id) {
        expect(command).toEqual(stop)
        expect((await store.session(id))?.transport).toBe(RpcTransport.Playing)
        throw new RpcError("sleep timer no longer armed", false)
      }
      expect(command).toEqual(volume)
      return { ...other, volume: 64, revision: 2 }
    },
  }
  const report = await sync(store, rpc, "sessions")
  expect(sent).toEqual(["sleep:bed", "turn-down"])
  expect(report).toMatchObject({
    pushed: 1,
    deferred: 0,
    dropped: [{ reason: "sleep timer no longer armed" }],
  })
  expect(await store.outbox()).toEqual([])
  expect((await store.session(other.id))?.volume).toBe(64)
  await store.close()
})
