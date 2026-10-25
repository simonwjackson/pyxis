import { createElement, Profiler } from "react"
import { createRoot } from "react-dom/client"
import { RpcPlacement } from "../../../contracts/generated/pyxis"
import { App } from "../src/bindings/App.binding"
import type { ClaimResult } from "../src/model/account"
import { initialSession, playbackSource } from "./playback-source"
import { silentAudio } from "./silent-audio"

const source = await playbackSource()
const queued = await source.worker.queueSessionCommand(initialSession(), {
  _tag: "queue.add",
  payload: { trackIds: ["first-track", "second-track"] },
})
await source.worker.queueSessionCommand(queued, { _tag: "transport.play", payload: {} })
let offline = false
let offlineSyncs = 0
let reconciledOffline = false
let committedOffline = false

const url = URL.createObjectURL(silentAudio())

const credential = {
  account: { id: "fixture", name: "Fixture", isDefault: true, createdAt: "2026-09-22T00:00:00Z" },
  device: { id: "phone", name: "Fixture phone" },
  token: "fixture",
}
const root = document.getElementById("root")
if (root === null) throw new Error("fixture root missing")
const app = createElement(App, {
  deviceName: "Fixture phone",
  accountEdge: {
    open: async () => ({}),
    settings: async () => ({}),
    writeSettings: async (settings) => settings,
    claim: async (): Promise<ClaimResult> => ({ status: "granted", credential }),
  },
  edge: {
    open: async () => ({}),
    albums: async () => [
      {
        id: "fixture-album",
        title: "Fixture album",
        artist: "Fixture artist",
        placement: RpcPlacement.Collection,
        addedAt: "2026-09-22T00:00:00Z",
        tags: [],
        placementUpdatedAt: "2026-09-22T00:00:00Z",
        revision: 1,
        tracks: ["first-track", "second-track"].map((id, index) => ({
          id,
          title: `Track ${index + 1}`,
          artist: "Fixture artist",
          trackNumber: index + 1,
          revision: 1,
        })),
      },
    ],
    offlineOverview: async () => ({ available: true, albums: [], totalBytes: 0 }),
    settings: async () => ({}),
    sync: async () => ({ offline: false, authRequired: false, deferred: 0 }),
  },
  playbackEdge: {
    ...source.edge,
    loadStream: async () => url,
    sessions: async () => {
      const sessions = await source.worker.sessions()
      if (offlineSyncs > 0) reconciledOffline = true
      return sessions
    },
    syncSessions: async () => {
      if (!offline) return source.worker.syncSessions()
      offlineSyncs += 1
      return {
        offline: true,
        authRequired: false,
        deferred: (await source.database.outbox()).length,
      }
    },
  },
  mediaSession: navigator.mediaSession,
})
createRoot(root).render(
  createElement(
    Profiler,
    {
      id: "media-session-regression",
      onRender: () => {
        // A returned sync response is not proof that React published its retained state.
        if (reconciledOffline) committedOffline = true
      },
    },
    app,
  ),
)

const probe = {
  failSync: () => {
    offline = true
    document.querySelector("audio")?.dispatchEvent(new Event("loadedmetadata"))
  },
  inspect: () => ({ offlineSyncs, committedOffline }),
}
declare global {
  interface Window {
    mediaSessionProbe: typeof probe
  }
}
window.mediaSessionProbe = probe
