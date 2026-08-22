/// Worker entry point.
///
/// The database lives here rather than on the page so that storage work, and later sync
/// and downloads, cannot block rendering. The page talks to it through `client.ts`.

import { createWorkerRpc } from "../rpc/client"
import type { WorkerRequest, WorkerResponse } from "./client"
import type { WorkerDatabase } from "./contract"
import { openWorkerDatabase } from "./database"
import { createProseqlEngine } from "./proseql-engine"
import { type SyncReport, sync } from "./sync"

/// Declared locally rather than pulled in through the `webworker` lib, which cannot be
/// combined with the DOM lib the rest of this client compiles against.
interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void
  postMessage(message: WorkerResponse): void
}

const scope = self as unknown as WorkerScope

let opening: Promise<WorkerDatabase> | undefined

async function database(): Promise<WorkerDatabase> {
  opening ??= (async () => {
    const handle = await createProseqlEngine()
    return openWorkerDatabase({
      engine: handle.engine,
      clear: handle.clear,
      onReset: (cause) => {
        // The page needs to know its local copy was discarded so it can refetch. Reported
        // rather than thrown, because a reset is a recovery, not a failure.
        console.warn("pyxis worker: local database reset", cause)
      },
    })
  })().catch((cause: unknown) => {
    // A cached rejection would wedge local storage for the life of the page. Let the next
    // request try again, since the usual causes are transient.
    opening = undefined
    throw cause
  })
  return opening
}

async function handle(request: WorkerRequest): Promise<unknown> {
  const store = await database()
  switch (request._tag) {
    case "worker.open":
      return store.report
    case "worker.settings.read":
      return store.settings()
    case "worker.settings.write":
      return store.writeSettings(request.payload)
    case "worker.albums.read":
      return store.albums()
    case "worker.album.read":
      return store.album(request.payload.id)
    case "worker.albums.replace":
      return store.replaceAlbums(request.payload.albums)
    case "worker.album.put":
      return store.putAlbum(request.payload.album)
    case "worker.album.remove":
      return store.removeAlbum(request.payload.id)
    case "worker.sessions.read":
      return store.sessions()
    case "worker.session.read":
      return store.session(request.payload.id)
    case "worker.session.put":
      return store.putSession(request.payload.session)
    case "worker.session.remove":
      return store.removeSession(request.payload.id)
    case "worker.queue.placement": {
      const { album, placement } = request.payload
      return store.queuePlacement(album, placement)
    }
    case "worker.queue.listen":
      return store.queueListen(request.payload.event)
    case "worker.queue.session-command":
      return store.queueSessionCommand(
        request.payload.session,
        request.payload.command,
        request.payload.commandId,
      )
    case "worker.sync": {
      const settings = await store.settings()
      if (settings.bearerToken === undefined) {
        // Nothing to reconcile with until this device has an account. That is a
        // credentials problem, not a network one, and saying so is the difference between
        // a client that waits forever and one that asks to be paired.
        const report: SyncReport = {
          pulled: 0,
          pushed: 0,
          converged: 0,
          dropped: [],
          deferred: (await store.outbox()).length,
          conflicts: [],
          offline: false,
          authRequired: true,
        }
        return report
      }
      return sync(
        store,
        createWorkerRpc({
          token: settings.bearerToken,
          ...(request.payload.origin === undefined ? {} : { origin: request.payload.origin }),
        }),
      )
    }
  }
}

scope.addEventListener("message", (event) => {
  const request = event.data
  void (async () => {
    try {
      // `undefined` survives a structured clone as a property value, so a missing album
      // stays missing instead of arriving as null and disagreeing with the declared type.
      const response: WorkerResponse = {
        id: request.id,
        outcome: { status: "ready", value: await handle(request) },
      }
      scope.postMessage(response)
    } catch (cause) {
      const response: WorkerResponse = {
        id: request.id,
        outcome: {
          status: "failed",
          message: cause instanceof Error ? cause.message : "worker operation failed",
        },
      }
      scope.postMessage(response)
    }
  })()
})
