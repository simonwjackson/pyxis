import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { AudioRenderer } from "../src/bindings/AudioRenderer.binding"
import { type PlaybackBinding, usePlayback } from "../src/bindings/usePlayback.binding"
import { initialSession, playbackSource } from "./playback-source"

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

// Real PCM silence exercises metadata and advancing currentTime without touching a music
// provider or making sound on the developer's machine.
function silence(): Blob {
  const samples = 8_000 * 30
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, "RIFF")
  view.setUint32(4, buffer.byteLength - 8, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8_000, true)
  view.setUint32(28, 16_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, samples * 2, true)
  return new Blob([buffer], { type: "audio/wav" })
}
const edge = {
  ...source.edge,
  loadStream: async (track: string) => {
    source.loads.push(track)
    return URL.createObjectURL(silence())
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
