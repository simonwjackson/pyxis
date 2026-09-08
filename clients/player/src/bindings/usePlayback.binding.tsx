/// Playback's only state reader.
///
/// This device is the host. It owns two things nobody else can know: where the audio
/// element actually is, and whether the sound is really coming out. Everything else about
/// a session — what is queued, what plays next, whether the album is over — belongs to the
/// core. This file reports facts upward and renders what it is told; it decides nothing.
///
/// The most important line in this file is the one that is missing. When a track ends this
/// reports `transport.trackEnded` and stops. It never picks a next track. An album that
/// finishes leaves silence, and the offer to continue is a button someone presses, not a
/// timer that fires. Auto-advance is why every other player turns an album into a feed.

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ListenTrackEventInput,
  RpcSession,
  RpcSessionCommand,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import type { WorkerClient } from "../../../app/src/worker/client.ts"
import { loading, type Remote, ready, type SyncOutcome, unavailable, unknown } from "../model/edge"
import { currentPlayback, type PlaybackView } from "../model/playback"

/// The slice of the worker this binding needs.
///
/// Narrow on purpose: a screen cannot quietly reach for a capability it has not declared,
/// and a test can supply real responses without a browser database.
export interface PlaybackWorkerEdge {
  sessions(): Promise<readonly RpcSession[]>
  queueSessionCommand(session: RpcSession, command: RpcSessionCommand): Promise<RpcSession>
  queueListen(event: ListenTrackEventInput): Promise<void>
  touchOfflineTrack(trackId: string): Promise<void>
  syncSessions(origin?: string): Promise<SyncOutcome>
}

/// Proof the real worker satisfies the port. A drift in the worker's shape becomes a
/// compile error here rather than a mismap at runtime. Yielding `false` rather than `never`
/// is what makes it bite, because `never` is assignable to everything.
type Assert<T extends true> = T
export type PlaybackEdgeIsSatisfiedByWorkerClient = Assert<
  WorkerClient extends PlaybackWorkerEdge ? true : false
>

/// The whole edge, including the two things the worker does not provide.
///
/// `loadStream` is the media seam. Audio bytes never cross a typed RPC call: this returns a
/// URL an `<audio>` element fetches over plain HTTP, and authorization for it is arranged
/// elsewhere. `ensureSession` is the session bootstrap, which belongs to whatever owns
/// pairing rather than to playback.
export interface PlaybackEdge extends PlaybackWorkerEdge {
  loadStream(trackId: string): Promise<string>
  ensureSession(): Promise<RpcSession>
}

export interface PlaybackOptions {
  /// Identifies the session hosted here, and stamps the listen record. Absent until the
  /// device is paired, which is a normal early state rather than an error.
  readonly deviceId?: string
  /// Injected so a test can assert on a stable identity. This is an idempotency key for
  /// replay, so uniqueness is the only requirement.
  readonly newEventId?: () => string
  /// How often the host tells the core where it actually is, while sound is coming out.
  ///
  /// Reporting only on pause loses the position whenever a tab is closed or a browser is
  /// killed, which is most of the time: people leave, they do not pause. The interval is a
  /// chattiness decision rather than a correctness one, so it is a parameter. Every report
  /// is read from the audio element, so a tick that fires while nothing is playing sends
  /// nothing rather than advancing a counter of its own.
  readonly positionReportIntervalMs?: number
}

export interface PlaybackBinding {
  readonly playback: Remote<PlaybackView | undefined>
  /// What the audio element should be playing, once a stream has been resolved.
  readonly audioUrl?: string
  readonly attachAudio: (element: HTMLAudioElement | null) => void
  /// Called by the audio element when the track runs out. Reports; never advances.
  readonly reportEnded: () => void
  readonly playAlbum: (trackIds: readonly string[]) => void
  readonly play: () => void
  readonly pause: () => void
  readonly refresh: () => void
  /// Accept a session record pushed by the core rather than asked for.
  ///
  /// Realtime events carry the whole record, so this replaces rather than patches. Without
  /// it the only way state ever moved was by asking, which is why an advancing album
  /// updated late and a command from another device did not show up at all.
  readonly applySession: (session: RpcSession) => void
  /// Obey a console. Another device asked this one to change a session it hosts.
  readonly applyDirective: (directive: RpcSessionDirective) => void
}

const eventId = () => crypto.randomUUID()

export function usePlayback(edge: PlaybackEdge, options: PlaybackOptions = {}): PlaybackBinding {
  const { deviceId, newEventId = eventId, positionReportIntervalMs = 15_000 } = options
  const [playback, setPlayback] = useState<Remote<PlaybackView | undefined>>(
    unknown<PlaybackView | undefined>,
  )
  const [audioUrl, setAudioUrl] = useState<string>()

  const audioElement = useRef<HTMLAudioElement | null>(null)
  const session = useRef<RpcSession | undefined>(undefined)
  /// Which track the loaded URL belongs to. Reloading the same track would swap the
  /// element's `src` and silently restart it from the beginning, so a re-render that
  /// touches this binding must not reach the network.
  const loadedTrack = useRef<string | undefined>(undefined)
  /// In-flight load, so a double press cannot download the same track twice and swap the
  /// element's source out from under playback.
  const inFlight = useRef<{ trackId: string; promise: Promise<void> } | undefined>(undefined)
  const loadGeneration = useRef(0)
  /// Where freshly loaded audio should start. Consumed exactly once, so a resume can never
  /// fight a manual seek made afterwards: rewinding is the listener's decision.
  const pendingSeekMs = useRef<number | undefined>(undefined)
  /// Discards a slow earlier read that would otherwise land after a newer one.
  const generation = useRef(0)
  /// Directives already carried out, so a redelivery after a reconnect is not applied twice.
  const seenDirectives = useRef<Set<string>>(new Set())

  const publish = useCallback((next: RpcSession | undefined) => {
    session.current = next
    setPlayback(ready(next === undefined ? undefined : currentPlayback([next], next.hostDeviceId)))
  }, [])

  const read = useCallback(async () => {
    generation.current += 1
    const mine = generation.current
    const current = () => generation.current === mine
    setPlayback(loading<PlaybackView | undefined>())
    let sessions: readonly RpcSession[]
    try {
      sessions = await edge.sessions()
    } catch (cause) {
      if (current()) setPlayback(unavailable({ kind: "failed", message: String(cause) }))
      return
    }
    if (!current()) return
    const view = currentPlayback(sessions, deviceId)
    session.current = sessions.find((candidate) => candidate.id === view?.sessionId)
    setPlayback(ready(view, "local"))

    let outcome: SyncOutcome
    try {
      outcome = await edge.syncSessions()
    } catch (cause) {
      if (current()) {
        setPlayback(unavailable({ kind: "failed", message: String(cause) }, view))
      }
      return
    }
    if (!current()) return
    try {
      const reconciled = await edge.sessions()
      if (!current()) return
      const next = currentPlayback(reconciled, deviceId)
      session.current = reconciled.find((candidate) => candidate.id === next?.sessionId)
      setPlayback(
        outcome.offline || outcome.authRequired || outcome.failure !== undefined
          ? unavailable(
              outcome.authRequired
                ? { kind: "auth-required" }
                : outcome.offline
                  ? { kind: "offline" }
                  : { kind: "failed", message: outcome.failure ?? "sync failed" },
              next,
            )
          : ready(next, "live"),
      )
    } catch {
      // Keep what is already shown. The session list is still the one just read.
    }
  }, [deviceId, edge])

  useEffect(() => {
    void read()
    return () => {
      generation.current += 1
    }
  }, [read])

  /// Resolve a stream URL for one track, at most once.
  const loadAudioFor = useCallback(
    async (trackId: string) => {
      if (loadedTrack.current === trackId && audioUrl !== undefined) return
      const running = inFlight.current
      if (running?.trackId === trackId) {
        await running.promise
        return
      }
      loadGeneration.current += 1
      const mine = loadGeneration.current
      const promise = (async () => {
        const url = await edge.loadStream(trackId)
        if (loadGeneration.current !== mine) {
          // A newer load won. Release the object URL rather than leaking it.
          if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(url)
          }
          return
        }
        loadedTrack.current = trackId
        pendingSeekMs.current = session.current?.positionMs ?? 0
        setAudioUrl(url)
        await edge.touchOfflineTrack(trackId).catch(() => undefined)
      })()
      inFlight.current = { trackId, promise }
      try {
        await promise
      } finally {
        if (inFlight.current?.promise === promise) inFlight.current = undefined
      }
    },
    [audioUrl, edge],
  )

  const view = playback.state === "ready" ? playback.value : undefined
  const trackId = view?.currentTrackId
  const transport = view?.transport

  /// Load only when the track actually changed.
  ///
  /// The "has this already loaded" decision lives in `loadAudioFor` alone. Repeating it here
  /// as an early return looked like a harmless optimisation and was worse than useless: it
  /// made the real guard unreachable, so a test could not tell a working guard from a
  /// deleted one. Two copies of one decision means one of them is dead.
  useEffect(() => {
    if (trackId === undefined || transport !== "playing") return
    void loadAudioFor(trackId).catch(() => undefined)
  }, [loadAudioFor, trackId, transport])

  /// Drive the element from the session, consuming any pending seek exactly once.
  useEffect(() => {
    const audio = audioElement.current
    if (audio === null) return
    if (transport === "playing" && audioUrl !== undefined) {
      const resumeFrom = pendingSeekMs.current
      pendingSeekMs.current = undefined
      if (resumeFrom !== undefined && resumeFrom > 0) audio.currentTime = resumeFrom / 1000
      // jsdom returns undefined here where a browser returns a promise, so this must not
      // assume a thenable. Autoplay refusal is a real browser outcome and is swallowed
      // rather than thrown into a render.
      void Promise.resolve(audio.play()).catch(() => undefined)
      return
    }
    audio.pause()
  }, [audioUrl, transport])

  const command = useCallback(
    async (next: RpcSessionCommand, target?: RpcSession) => {
      const on = target ?? session.current
      if (on === undefined) return
      publish(await edge.queueSessionCommand(on, next))
    },
    [edge, publish],
  )

  /// Tell the core where this host actually is.
  ///
  /// Only the host knows. Without it a console shows a frozen position and a handoff
  /// resumes every track from zero. A zero reading is skipped because it is far more often
  /// an element that has not started than a genuine rewind to the very beginning.
  const reportPosition = useCallback(async () => {
    const positionMs = Math.round((audioElement.current?.currentTime ?? 0) * 1000)
    if (positionMs <= 0) return
    await command({ _tag: "position.report", payload: { positionMs } })
  }, [command])

  /// Keep the core's idea of the position roughly current while sound is coming out.
  ///
  /// Guarded on `transport === "playing"` rather than on the element, because a paused
  /// element still has a `currentTime` and reporting it forever would keep a finished
  /// session looking alive. Position is always read from the element at the moment of the
  /// report; nothing here simulates progress between ticks.
  useEffect(() => {
    if (transport !== "playing" || positionReportIntervalMs <= 0) return
    const timer = setInterval(() => {
      void reportPosition().catch(() => undefined)
    }, positionReportIntervalMs)
    return () => clearInterval(timer)
  }, [positionReportIntervalMs, reportPosition, transport])

  const reportEnded = useCallback(() => {
    void (async () => {
      const on = session.current
      const endedTrack = on?.currentTrackId
      if (on === undefined || endedTrack === undefined) return
      // What actually played, rather than the track's nominal length. Both are unavailable
      // often enough that the field is omitted rather than sent as a guess.
      const played = audioElement.current?.currentTime ?? Number.NaN
      const playedMs = Number.isFinite(played) ? Math.round(played * 1000) : 0
      await edge
        .queueListen({
          id: newEventId(),
          trackId: endedTrack,
          deviceId: deviceId ?? on.hostDeviceId,
          listenedAt: new Date().toISOString(),
          ...(playedMs > 0 ? { playedMs } : {}),
          completed: true,
          context: "queue",
          contextId: on.id,
        })
        .catch(() => undefined)
      // Report and stop. Whether anything follows is the core's decision, and if the album
      // is over the answer is silence.
      await command({ _tag: "transport.trackEnded", payload: {} }, on).catch(() => undefined)
    })()
  }, [command, deviceId, edge, newEventId])

  const playAlbum = useCallback(
    (trackIds: readonly string[]) => {
      void (async () => {
        if (trackIds.length === 0) return
        const target = await edge.ensureSession()
        const cleared = await edge.queueSessionCommand(target, {
          _tag: "queue.clear",
          payload: {},
        })
        const queued = await edge.queueSessionCommand(cleared, {
          _tag: "queue.add",
          payload: { trackIds: [...trackIds] },
        })
        publish(await edge.queueSessionCommand(queued, { _tag: "transport.play", payload: {} }))
      })()
    },
    [edge, publish],
  )

  const play = useCallback(() => {
    void command({ _tag: "transport.play", payload: {} })
  }, [command])

  const pause = useCallback(() => {
    void (async () => {
      await command({ _tag: "transport.pause", payload: {} })
      await reportPosition()
    })()
  }, [command, reportPosition])

  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audioElement.current = element
    const volume = session.current?.volume
    if (element !== null && volume !== undefined) element.volume = volume / 100
  }, [])

  const refresh = useCallback(() => {
    void read()
  }, [read])

  /// Take a pushed session, if it is this device's to take.
  ///
  /// Guarded on the host. Every session on the account arrives on the sessions topic, so an
  /// ungated version would let the record playing in another room overwrite what this
  /// device is rendering -- and this binding drives a real audio element, so that is not a
  /// display glitch but the wrong track coming out of the speakers. A session already being
  /// tracked is also accepted, so a handoff that moves a session away is not ignored on the
  /// way out.
  const applySession = useCallback(
    (next: RpcSession) => {
      const mine = deviceId !== undefined && next.hostDeviceId === deviceId
      if (!mine && session.current?.id !== next.id) return
      // Beat any read that is still in flight: this record is newer than a response that
      // has not landed yet, and letting a slow read win would move playback backwards.
      generation.current += 1
      publish(next)
    },
    [deviceId, publish],
  )

  /// Carry out a command another device asked for.
  ///
  /// This device is the renderer, so a console cannot change the sound itself: it asks, and
  /// the host applies. Repeats are discarded by `directiveId`, which the contract provides
  /// for exactly this -- a socket that drops mid-delivery redelivers, and applying
  /// `queue.add` twice would put the album in the queue twice.
  const applyDirective = useCallback(
    (directive: RpcSessionDirective) => {
      if (seenDirectives.current.has(directive.directiveId)) return
      seenDirectives.current.add(directive.directiveId)
      // Bounded, because a long-lived page would otherwise grow this set forever. Far more
      // than any redelivery window and still nothing in memory terms.
      if (seenDirectives.current.size > 512) {
        const oldest = seenDirectives.current.values().next()
        if (!oldest.done) seenDirectives.current.delete(oldest.value)
      }
      const on = session.current
      // Addressed to a session this device is not hosting. The core routes by device, so
      // this means the world moved; asking for the truth beats guessing at it.
      if (on === undefined || on.id !== directive.sessionId) {
        void read()
        return
      }
      void command(directive.command, on).catch(() => undefined)
    },
    [command, read],
  )

  return {
    playback,
    ...(audioUrl === undefined ? {} : { audioUrl }),
    attachAudio,
    reportEnded,
    playAlbum,
    play,
    pause,
    refresh,
    applySession,
    applyDirective,
  }
}
