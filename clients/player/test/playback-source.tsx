import { type RpcSession, RpcTransport } from "../../../contracts/generated/pyxis"
import type { WorkerRpc } from "../../app/src/rpc/client"
import { accountFencedDatabase } from "../../app/src/worker/account-fenced-database"
import { createDirectWorkerClient } from "../../app/src/worker/client"
import { createMemoryEngine, openWorkerDatabase } from "../../app/src/worker/database"
import { applySessionCommand } from "../../app/src/worker/session-local"
import type { PlaybackEdge } from "../src/bindings/usePlayback.binding"

export const initialSession = (): RpcSession => ({
  id: "selected",
  name: "Phone",
  hostDeviceId: "phone",
  queue: [],
  transport: RpcTransport.Stopped,
  positionMs: 0,
  volume: 0,
  reachable: true,
  revision: 1,
  updatedAt: "2026-09-09T00:00:00Z",
})

// Same per-operation database lock and serialized sync passes as the dedicated browser
// worker. Network replies run outside that lock, so command/event races remain testable.
export async function playbackSource(options: { replyDelayMs?: number } = {}) {
  const store = await openWorkerDatabase({ engine: createMemoryEngine() })
  await store.writeSettings({ accountId: "fixture", deviceId: "phone", bearerToken: "fixture" })
  let lock = Promise.resolve()
  const database = accountFencedDatabase(store, "fixture", (operation) => {
    const result = lock.then(() => operation(store))
    lock = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  })
  let remote = initialSession()
  await database.putSession(remote)
  let onSession: (session: RpcSession) => void = () => {}
  const loads: string[] = []
  const sent: string[] = []
  const receipts = new Map<string, RpcSession>()
  const rpc: WorkerRpc = {
    listAlbums: async () => [],
    listSessions: async () => [remote],
    runSessionCommand: async (_id, command, commandId) => {
      const prior = commandId === undefined ? undefined : receipts.get(commandId)
      if (prior !== undefined) return prior
      remote = applySessionCommand(remote, command)
      const verdict = remote
      if (commandId !== undefined) receipts.set(commandId, verdict)
      sent.push(command._tag)
      onSession(verdict)
      await new Promise((resolve) => setTimeout(resolve, options.replyDelayMs ?? 10))
      return verdict
    },
    setPlacement: async () => undefined,
    appendListen: async () => ({ accepted: 0, duplicates: 0 }),
  }
  const direct = createDirectWorkerClient(
    async () => database,
    () => rpc,
  )
  let sync = Promise.resolve()
  const worker = {
    ...direct,
    syncSessions: () => {
      const next = sync.then(() => direct.syncSessions())
      sync = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
  }
  const edge: PlaybackEdge = {
    ...worker,
    ensureSession: async () => (await worker.session(remote.id)) ?? remote,
    loadStream: async (track) => {
      loads.push(track)
      return `/stream/${track}`
    },
  }
  return {
    edge,
    worker,
    database,
    loads,
    sent,
    subscribe: (handler: typeof onSession) => {
      onSession = handler
    },
    remote: () => remote,
  }
}
