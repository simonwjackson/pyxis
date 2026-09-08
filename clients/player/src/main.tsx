/// The composition root: the only place that builds the object graph.
///
/// It spawns the real worker, builds the RPC transport and the stream loader, joins them
/// into the ports the shell asks for, and hands those down as plain objects. Nothing below
/// here knows the worker or the network exists, which is what makes the whole tree testable
/// without either.
///
/// This is also the only file allowed to reach for a global. Everything it reaches for is
/// passed inward as a parameter — `fetch`, the service worker controller, the browser's own
/// description of itself — so the modules that use them stay pure and testable. That is the
/// entire reason this file is thin: it wires, it does not decide.

import { createElement } from "react"
import { createRoot } from "react-dom/client"
import type { RpcSession } from "../../../contracts/generated/pyxis.ts"
import { registerPwa } from "../../app/src/pwa/register.ts"
import { spawnWorkerClient } from "../../app/src/worker/client.ts"
import { App } from "./bindings/App.binding.tsx"
import type { AccountEdge } from "./bindings/useAccount.binding.tsx"
import type { PlaybackEdge } from "./bindings/usePlayback.binding.tsx"
import type { RealtimeEdge } from "./bindings/useRealtime.binding.tsx"
import type { UpdateEdge } from "./bindings/useUpdate.binding.tsx"
import { deviceNameFrom, readClaimOutcome } from "./model/account.ts"
import { chooseLocalSession } from "./model/playback.ts"
import { realtimeUrlFrom } from "./rpc/realtime.ts"
import { createStreamLoader } from "./rpc/stream.ts"
import { createRpcTransport } from "./rpc/transport.ts"
import { bundleOf } from "./rpc/updates.ts"
import "./system-next/tokens.css"

const host = document.getElementById("root")
if (!host) throw new Error("Missing root")

// The token scope is also the container-query container, so it has to be a real element
// wrapping the tree rather than something a component applies to itself.
host.classList.add("px-scope")
host.dataset.theme = "dark"

// Built once, outside render. A worker client rebuilt on every render would restart
// reconciliation forever, which is exactly the trap the binding's stable-identity note warns
// about. The same applies to every port assembled below.
const worker = spawnWorkerClient(true)

// The service worker is not only an offline shell: it is what attaches credentials to media
// requests. An audio element cannot send an Authorization header, so without a registered
// worker every stream is an unauthenticated request. Registered outside render for the same
// reason the worker client is.
void registerPwa()

// Wrapped rather than passed by reference: an unbound `fetch` throws when it is called
// without its global as the receiver.
const request = (input: string, init?: RequestInit) => globalThis.fetch(input, init)
const rpc = createRpcTransport({ request })
const streams = createStreamLoader({
  request,
  // Read at call time. A service worker takes control after the page has loaded, so a
  // controller captured here would usually be the null from before it did — which would
  // silently send every stream down the slow whole-file path.
  controller: () => globalThis.navigator?.serviceWorker?.controller ?? undefined,
})

/// The credential, read from the worker's settings row at the moment it is needed.
///
/// The durable row is the single source of the credential: `useAccount` writes it there, so
/// reading it here rather than threading React state keeps these ports stable for the life
/// of the page. A port rebuilt when the credential arrived would restart reconciliation.
const credentials = async () => {
  const settings = await worker.settings()
  const { bearerToken, accountId, deviceId } = settings
  if (bearerToken === undefined || accountId === undefined || deviceId === undefined) {
    // Not a network failure and not worth retrying. Whoever asked has jumped ahead of
    // pairing, and saying so plainly beats a request that cannot be authorised.
    throw new Error("this device is not paired yet")
  }
  return {
    token: bearerToken,
    accountId,
    deviceId,
    streamEpoch: settings.streamEpoch ?? 0,
    deviceName: settings.deviceName,
  }
}

const accountEdge: AccountEdge = {
  open: () => worker.open(),
  settings: () => worker.settings(),
  writeSettings: (patch) => worker.writeSettings(patch),
  // Transport returns the core's answer whole; the model decides what it means. Keeping
  // that reading in one place is why a refusal to admit an unpaired device stays
  // distinguishable from a core that could not be reached.
  claim: async (name) => readClaimOutcome(await rpc.claimDevice(name)),
}

/// Held while an answer is in flight so concurrent callers share one, and cleared after so a
/// failure is retried rather than remembered.
let pendingSession: Promise<RpcSession> | undefined

const playbackEdge: PlaybackEdge = {
  sessions: () => worker.sessions(),
  queueSessionCommand: (session, command) => worker.queueSessionCommand(session, command),
  queueListen: (event) => worker.queueListen(event),
  touchOfflineTrack: (trackId) => worker.touchOfflineTrack(trackId),
  syncSessions: (origin) => worker.syncSessions(origin),
  loadStream: async (trackId) => {
    const { token, accountId, deviceId, streamEpoch } = await credentials()
    return streams.load(trackId, { token, accountId, deviceId, streamEpoch })
  },
  /// Reuse the session this device already hosts, or create one.
  ///
  /// Reuse rather than create-every-time, because a second session for the same device is a
  /// second place music could be playing. The created session is written into the worker's
  /// store before it is returned, since the commands that follow are queued locally against
  /// a session the worker has to already know about.
  // Shared rather than raced. Two callers arriving together each saw no session of their
  // own and each created one, which is how a single device came to host six. They now wait
  // on the same answer, and a failure clears the slot so the next caller genuinely retries.
  ensureSession: async () => {
    pendingSession ??= (async () => {
      const { token, deviceId, deviceName } = await credentials()
      const existing = await rpc.listSessions(token)
      // The same rule the renderer and the event gate use. Three callers each picking the
      // first match in list order disagreed once there was more than one to pick from.
      const mine = chooseLocalSession(existing, deviceId)
      if (mine !== undefined) return worker.putSession(mine)
      // Named for the device, because a session name is read by a person deciding where to
      // send music, and "this browser" is the honest answer.
      const created = await rpc.createSession(token, deviceName ?? "This device")
      return worker.putSession(created)
    })().finally(() => {
      pendingSession = undefined
    })
    return pendingSession
  },
}

// A label, not an identity. The hints come from the browser here so the model stays free of
// globals and testable; it decides what to do when a hint is missing. An absent hint is
// omitted rather than passed as undefined, so "we could not tell" never reaches the model
// disguised as an answer.
const userAgent = globalThis.navigator?.userAgent
const browser = userAgent === undefined ? undefined : browserNameFrom(userAgent)
const platform = globalThis.navigator?.platform
const deviceName = deviceNameFrom({
  ...(browser === undefined ? {} : { browser }),
  ...(platform === undefined ? {} : { platform }),
})

/// The browser's common name, or nothing.
///
/// A user-agent string is not a fact about hardware, so this reads only the few names a
/// person would recognise and gives up rather than guessing. Order matters: several
/// browsers still identify as Chrome or Safari, so the more specific names are tested first.
function browserNameFrom(userAgent: string): string | undefined {
  const known: readonly (readonly [string, string])[] = [
    ["Firefox", "Firefox"],
    ["Edg/", "Edge"],
    ["OPR/", "Opera"],
    ["Chrome", "Chrome"],
    ["Safari", "Safari"],
  ]
  return known.find(([needle]) => userAgent.includes(needle))?.[1]
}

/// The socket, supplied the same way `fetch` is.
///
/// A `WebSocket` is a global, so the modules below this one never name it. Bound here
/// because only a composition root may reach for one, and constructed per call so a
/// reconnect gets a genuinely new socket rather than a reused corpse.
const realtimeEdge: RealtimeEdge = {
  open: (url) => new WebSocket(url),
  url: realtimeUrlFrom(globalThis.location.origin),
}

/// Noticing a newer build, and moving onto it only when asked.
///
/// `location.reload` is a global, so it is bound here and handed in. The bundle this page
/// runs is read from this module's own URL, which Vite rewrites to the hashed asset at build
/// time; in dev it is the source path, which `bundleOf` reads as "unknown" and the watcher
/// then learns from the first shell it fetches.
const runningBundle = bundleOf(import.meta.url)
const updateEdge: UpdateEdge = {
  request,
  reload: () => globalThis.location.reload(),
  ...(runningBundle === undefined ? {} : { current: runningBundle }),
}

createRoot(host).render(
  createElement(App, {
    edge: worker,
    accountEdge,
    playbackEdge,
    realtimeEdge,
    updateEdge,
    // Another global, bound here for the same reason as the rest. Absent in browsers that
    // have no media session, where the app simply goes untold on the lock screen.
    ...(globalThis.navigator?.mediaSession === undefined
      ? {}
      : { mediaSession: globalThis.navigator.mediaSession }),
    deviceName,
  }),
)
