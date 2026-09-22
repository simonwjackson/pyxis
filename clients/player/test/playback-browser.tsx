import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { AudioRenderer } from "../src/bindings/AudioRenderer.binding"
import { type PlaybackBinding, usePlayback } from "../src/bindings/usePlayback.binding"
import { initialSession, playbackSource } from "./playback-source"
import { silentAudio } from "./silent-audio"

const source = await playbackSource({ replyDelayMs: 30 })
let local = initialSession()
for (const track of ["historical-a", "historical-b", "latest-saved"]) {
  local = await source.worker.queueSessionCommand(local, { _tag: "queue.clear", payload: {} })
  local = await source.worker.queueSessionCommand(local, {
    _tag: "queue.add",
    payload: { trackIds: [track] },
  })
  local = await source.worker.queueSessionCommand(local, { _tag: "transport.play", payload: {} })
}

const edge = {
  ...source.edge,
  loadStream: async (track: string) => {
    source.loads.push(track)
    return URL.createObjectURL(silentAudio())
  },
}
let binding: PlaybackBinding | undefined
source.subscribe((session) => binding?.applySession(session))
function PlaybackProbe() {
  binding = usePlayback(edge, { deviceId: "phone", positionReportIntervalMs: 0 })
  return createElement(AudioRenderer, { playback: binding })
}
const root = document.getElementById("root")
if (root === null) throw new Error("fixture root missing")
createRoot(root).render(createElement(PlaybackProbe))

const probe = {
  loads: source.loads,
  sent: source.sent,
  choose: () => {
    binding?.playAlbum(["choice-a"])
    binding?.playAlbum(["choice-b"])
    binding?.playAlbum(["latest-choice"])
  },
  inspect: async () => ({
    queue: (await source.worker.session("selected"))?.queue,
    pending: (await source.database.outbox()).length,
    remoteQueue: source.remote().queue,
  }),
}
declare global {
  interface Window {
    playbackProbe: typeof probe
  }
}
window.playbackProbe = probe
