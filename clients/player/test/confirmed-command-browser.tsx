import { createElement } from "react"
import { createRoot } from "react-dom/client"
import type { RpcSessionCommand } from "../../../contracts/generated/pyxis"
import { AudioRenderer } from "../src/bindings/AudioRenderer.binding"
import { type PlaybackBinding, usePlayback } from "../src/bindings/usePlayback.binding"
import { initialSession, playbackSource } from "./playback-source"
import { silentAudio } from "./silent-audio"

const source = await playbackSource()
const audible = await source.worker.queueSessionCommand(initialSession(), {
  _tag: "volume.set",
  payload: { volume: 100 },
})
const queued = await source.worker.queueSessionCommand(audible, {
  _tag: "queue.add",
  payload: { trackIds: ["first-track"] },
})
await source.worker.syncSessions()

let binding: PlaybackBinding | undefined
let refuseNextPlayWrite = false
let holdStreams = false
let releaseHeld: (() => void) | undefined
let armedClick:
  | { readonly kind: "Play" }
  | { readonly kind: "Pause" }
  | { readonly kind: "Album"; readonly track: string }
  | undefined
const loads: string[] = []
const edge = {
  ...source.edge,
  queueSessionCommand: async (
    target: Parameters<typeof source.worker.queueSessionCommand>[0],
    command: RpcSessionCommand,
    commandId?: string,
    expectedRevision?: number,
  ) => {
    if (refuseNextPlayWrite && command._tag === "transport.play") {
      refuseNextPlayWrite = false
      throw new Error("configured storage failure after audio confirmation")
    }
    return source.worker.queueSessionCommand(target, command, commandId, expectedRevision)
  },
  loadStream: async (track: string) => {
    loads.push(track)
    if (holdStreams) {
      await new Promise<void>((resolve) => {
        releaseHeld = resolve
      })
    }
    return URL.createObjectURL(silentAudio())
  },
}
source.subscribe((session) => binding?.applySession(session))
function ConfirmedCommandProbe() {
  binding = usePlayback(edge, { deviceId: "phone", positionReportIntervalMs: 0 })
  return createElement(AudioRenderer, { playback: binding })
}
const root = document.getElementById("root")
if (root === null) throw new Error("fixture root missing")
createRoot(root).render(createElement(ConfirmedCommandProbe))

// A real pointer click supplies browser activation. The test never replaces play() or
// dispatches a synthetic click to claim that an autoplay refusal was recovered.
document.addEventListener("click", () => {
  const action = armedClick
  armedClick = undefined
  if (action?.kind === "Play") binding?.play()
  if (action?.kind === "Pause") binding?.pause()
  if (action?.kind === "Album") binding?.playAlbum([action.track])
})

const probe = {
  armClick: (action: NonNullable<typeof armedClick>) => {
    armedClick = action
  },
  direct: (commandId: string, command: RpcSessionCommand) => {
    binding?.applyDirective({
      sessionId: queued.id,
      command,
      directiveId: commandId,
      issuedBy: "console",
    })
  },
  refresh: () => {
    binding?.refresh()
  },
  failNextPlayWrite: () => {
    refuseNextPlayWrite = true
  },
  holdStreams: () => {
    holdStreams = true
  },
  releaseStream: () => {
    holdStreams = false
    releaseHeld?.()
    releaseHeld = undefined
  },
  inspect: async () => {
    const stored = await source.worker.session(queued.id)
    const state = binding?.playback
    const audio = document.querySelector("audio")
    return {
      nativeAudio:
        audio === null
          ? undefined
          : {
              paused: audio.paused,
              currentTime: audio.currentTime,
              volume: audio.volume,
              muted: audio.muted,
            },
      activation: navigator.userActivation.hasBeenActive,
      ready: state !== undefined && state.state !== "unknown" && state.state !== "loading",
      state,
      queue: stored?.queue,
      transport: stored?.transport,
      volume: stored?.volume,
      pending: (await source.database.outbox()).length,
      remoteTransport: source.remote().transport,
      sent: [...source.sent],
      loads: [...loads],
    }
  },
  receipt: async (commandId: string, command: RpcSessionCommand) =>
    (await source.worker.previewSessionCommand(queued.id, command, commandId)).replayed,
}
declare global {
  interface Window {
    confirmedCommandProbe: typeof probe
  }
}
window.confirmedCommandProbe = probe
