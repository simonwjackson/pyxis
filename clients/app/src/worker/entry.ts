/// Worker entry point.
///
/// The database lives here rather than on the page so that storage work, and later sync
/// and downloads, cannot block rendering. The page talks to it through `client.ts`.

import type { WorkerRequest, WorkerResponse } from "./client"
import type { WorkerDatabase } from "./contract"
import { openWorkerDatabase } from "./database"
import { createProseqlEngine } from "./proseql-engine"

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
