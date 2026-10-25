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

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ListenTrackEventInput,
  RpcSession,
  RpcSessionCommand,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import {
  type ConfirmedPlaybackHost,
  createConfirmedPlaybackHost,
} from "../../../app/src/playback/confirmed-host"
import type { WorkerClient } from "../../../app/src/worker/client.ts"
import {
  loading,
  type Remote,
  ready,
  type SyncOutcome,
  shownValue,
  unavailable,
  unknown,
} from "../model/edge"
import { chooseLocalSession, type PlaybackView, readSession } from "../model/playback"

/// The slice of the worker this binding needs.
///
/// Narrow on purpose: a screen cannot quietly reach for a capability it has not declared,
/// and a test can supply real responses without a browser database.
export interface PlaybackWorkerEdge {
  sessions(): Promise<readonly RpcSession[]>
  applySessionEvent: WorkerClient["applySessionEvent"]
  session: WorkerClient["session"]
  previewSessionCommand: WorkerClient["previewSessionCommand"]
  queueSessionCommand: WorkerClient["queueSessionCommand"]
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
  /// Called by the audio element once it has decoded enough to know how long the track is.
  readonly reportDuration: () => void
  readonly playAlbum: (trackIds: readonly string[]) => void
  readonly play: () => void
  readonly pause: () => void
  /// Move to the next or previous track. Absent from the core's vocabulary, so both are a
  /// cursor jump followed by a play; see `skip`.
  readonly next: () => void
  readonly previous: () => void
  /// Move within the current track through the shared renderer-confirmed seek command.
  readonly seek: (positionMs: number) => void
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

/// How long the loaded track runs, if the element has decoded enough to say.
///
/// `duration` is NaN before metadata arrives and Infinity for a stream of unknown length, so
/// both are refused rather than sent as a number the core would store and a dashboard would
/// draw a bar against.
///
/// Module scope rather than the component body so it is stable across renders: defined
/// inside, it became a new function every render and a dependency of every callback that
/// used it, which would have rebuilt them all on each pass.
function elementDurationMs(audio: HTMLAudioElement | null): number | undefined {
  const duration = audio?.duration
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return undefined
  return Math.round(duration * 1000)
}

export function usePlayback(edge: PlaybackEdge, options: PlaybackOptions = {}): PlaybackBinding {
  const { deviceId, newEventId = eventId, positionReportIntervalMs = 15_000 } = options
  const [playback, setPlayback] = useState<Remote<PlaybackView | undefined>>(
    unknown<PlaybackView | undefined>,
  )
  const [audioUrl, setAudioUrl] = useState<string>()

  const audioElement = useRef<HTMLAudioElement | null>(null)
  const session = useRef<RpcSession | undefined>(undefined)
  const hostFailure = useRef<string | undefined>(undefined)
  /// Discards a slow earlier read that would otherwise land after a newer one.
  const generation = useRef(0)
  const selectedId = useRef<string | undefined>(undefined)
  const pendingEvent = useRef<RpcSession | undefined>(undefined)
  const eventGeneration = useRef(0)
  const commands = useRef(Promise.resolve())
  const pendingCommands = useRef(0)

  const publish = useCallback((next: RpcSession | undefined) => {
    generation.current += 1
    session.current = next
    if (next !== undefined) selectedId.current = next.id
    const view = next === undefined ? undefined : readSession(next)
    setPlayback(
      hostFailure.current === undefined
        ? ready(view)
        : unavailable({ kind: "failed", message: hostFailure.current }, view),
    )
  }, [])

  const select = useCallback(
    (sessions: readonly RpcSession[]) => {
      const next =
        selectedId.current === undefined
          ? chooseLocalSession(sessions, deviceId)
          : sessions.find(
              (candidate) =>
                candidate.id === selectedId.current && candidate.hostDeviceId === deviceId,
            )
      if (next !== undefined) selectedId.current = next.id
      return next
    },
    [deviceId],
  )

  const read = useCallback(async () => {
    generation.current += 1
    const mine = generation.current
    const current = () => generation.current === mine
    if (session.current === undefined) setPlayback(loading<PlaybackView | undefined>())
    let sessions: readonly RpcSession[]
    try {
      sessions = await edge.sessions()
    } catch (cause) {
      if (current())
        setPlayback(unavailable({ kind: "failed", message: hostFailure.current ?? String(cause) }))
      return
    }
    if (!current()) return
    const local = select(sessions)
    const view = local === undefined ? undefined : readSession(local)
    if (pendingCommands.current === 0) {
      session.current = local
      setPlayback(
        hostFailure.current === undefined
          ? ready(view, "local")
          : unavailable({ kind: "failed", message: hostFailure.current }, view),
      )
    }

    let outcome: SyncOutcome
    try {
      outcome = await edge.syncSessions()
    } catch (cause) {
      if (current()) {
        setPlayback(
          unavailable({ kind: "failed", message: hostFailure.current ?? String(cause) }, view),
        )
      }
      return
    }
    if (!current()) return
    try {
      const retained = pendingEvent.current
      if (retained !== undefined) {
        const applied = await edge.applySessionEvent(retained)
        if (applied.status === "applied" && pendingEvent.current === retained) {
          pendingEvent.current = undefined
        }
      }
      const reconciled = await edge.sessions()
      if (!current() || pendingCommands.current > 0) return
      const chosen = select(reconciled)
      const next = chosen === undefined ? undefined : readSession(chosen)
      session.current = chosen
      setPlayback(
        hostFailure.current !== undefined
          ? unavailable({ kind: "failed", message: hostFailure.current }, next)
          : outcome.offline || outcome.authRequired || outcome.failure !== undefined
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
  }, [edge, select])

  useEffect(() => {
    session.current = undefined
    selectedId.current = undefined
    pendingEvent.current = undefined
    hostFailure.current = undefined
    void read()
    return () => {
      generation.current += 1
    }
  }, [read])

  // A queue replacement is one local operation. Serializing individual database calls
  // alone permits clear(A), clear(B), add(A), add(B), which mixes albums.
  const run = useCallback(
    (action: () => Promise<void>) => {
      generation.current += 1
      pendingCommands.current += 1
      commands.current = commands.current
        .then(action)
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return
          hostFailure.current = String(cause)
          setPlayback(
            unavailable(
              { kind: "failed", message: hostFailure.current },
              session.current === undefined ? undefined : readSession(session.current),
            ),
          )
        })
        .finally(() => {
          pendingCommands.current -= 1
          if (pendingCommands.current === 0) void read()
        })
    },
    [read],
  )

  const hostSlot = useMemo(
    () => ({
      current: undefined as ConfirmedPlaybackHost | undefined,
      create: () =>
        createConfirmedPlaybackHost({
          store: edge,
          loadStream: (trackId) => edge.loadStream(trackId),
          selectedSession: () => session.current,
          deviceId: () => deviceId,
          publishSession: publish,
          publishAudioUrl: setAudioUrl,
          reportFailure: (cause) => {
            hostFailure.current = String(cause)
            setPlayback(
              unavailable(
                { kind: "failed", message: hostFailure.current },
                session.current === undefined ? undefined : readSession(session.current),
              ),
            )
          },
          requestSessionSync: () => {
            void read()
          },
          newCommandId: () => crypto.randomUUID(),
        }),
    }),
    [deviceId, edge, publish, read],
  )
  const playbackHost = useCallback(() => {
    hostSlot.current ??= hostSlot.create()
    return hostSlot.current
  }, [hostSlot])
  useEffect(
    () => () => {
      hostSlot.current?.dispose()
      hostSlot.current = undefined
    },
    [hostSlot],
  )

  const view = shownValue(playback)
  const transport = view?.transport
  useEffect(() => {
    playbackHost().renderSession(
      view?.sessionId === session.current?.id ? session.current : undefined,
    )
  }, [playbackHost, view])

  const command = useCallback(
    async (next: RpcSessionCommand, target?: RpcSession) => {
      const on = target ?? session.current
      if (on === undefined || on.hostDeviceId !== deviceId) return
      const outcome = await playbackHost().execute(on.id, next)
      if (
        next._tag === "transport.play" &&
        outcome._tag === "Applied" &&
        !outcome.replayed &&
        outcome.session.transport === "playing"
      ) {
        hostFailure.current = undefined
        publish(session.current)
      }
      return outcome.session
    },
    [deviceId, playbackHost, publish],
  )

  /// Tell the core where this host actually is.
  ///
  /// Only the host knows. Without it a console shows a frozen position and a handoff
  /// resumes every track from zero. A zero reading is skipped because it is far more often
  /// an element that has not started than a genuine rewind to the very beginning.
  const reportPosition = useCallback(async () => {
    if (playbackHost().loadedTrack() !== session.current?.currentTrackId) return
    const positionMs = Math.round((audioElement.current?.currentTime ?? 0) * 1000)
    if (positionMs <= 0) return
    const durationMs = elementDurationMs(audioElement.current)
    await command({
      _tag: "position.report",
      // Carried alongside the position because only the host has it: the core stores a
      // duration but nothing ever sent one, so every track looked endless and a progress
      // bar had nothing to draw against.
      payload: { positionMs, ...(durationMs === undefined ? {} : { durationMs }) },
    })
  }, [command, playbackHost])

  /// Say how long the track is, as soon as the element knows.
  ///
  /// Separate from `reportPosition` because that one refuses a zero position, and zero is
  /// exactly where a freshly loaded track sits. Waiting for the first tick instead would
  /// leave a dashboard with no progress bar for the opening seconds of every track.
  const reportDuration = useCallback(() => {
    const track = playbackHost().loadedTrack()
    if (track !== session.current?.currentTrackId) return
    const durationMs = elementDurationMs(audioElement.current)
    if (durationMs === undefined) return
    const positionMs = Math.round((audioElement.current?.currentTime ?? 0) * 1000)
    run(async () => {
      if (track !== session.current?.currentTrackId) return
      await command({ _tag: "position.report", payload: { positionMs, durationMs } })
    })
  }, [command, playbackHost, run])

  /// Keep the core's idea of the position roughly current while sound is coming out.
  ///
  /// Guarded on `transport === "playing"` rather than on the element, because a paused
  /// element still has a `currentTime` and reporting it forever would keep a finished
  /// session looking alive. Position is always read from the element at the moment of the
  /// report; nothing here simulates progress between ticks.
  useEffect(() => {
    if (transport !== "playing" || positionReportIntervalMs <= 0) return
    const timer = setInterval(() => {
      run(reportPosition)
    }, positionReportIntervalMs)
    return () => clearInterval(timer)
  }, [positionReportIntervalMs, reportPosition, run, transport])

  const reportEnded = useCallback(() => {
    const ended = session.current
    // The old element can still emit while the replacement stream is resolving.
    if (playbackHost().loadedTrack() !== ended?.currentTrackId) return
    run(async () => {
      if (session.current?.currentTrackId !== ended?.currentTrackId) return
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
    })
  }, [command, deviceId, edge, newEventId, playbackHost, run])

  const playAlbum = useCallback(
    (trackIds: readonly string[]) => {
      if (trackIds.length === 0) return
      hostFailure.current = undefined
      run(async () => {
        const target = session.current ?? (await edge.ensureSession())
        if (session.current === undefined) {
          session.current = target
          selectedId.current = target.id
        }
        const host = playbackHost()
        await host.execute(target.id, { _tag: "queue.clear", payload: {} })
        await host.execute(target.id, { _tag: "queue.add", payload: { trackIds: [...trackIds] } })
        await command({ _tag: "transport.play", payload: {} })
      })
    },
    [command, edge, playbackHost, run],
  )

  const play = useCallback(() => {
    hostFailure.current = undefined
    run(async () => {
      await command({ _tag: "transport.play", payload: {} })
    })
  }, [command, run])

  /// Move by one track, either way.
  ///
  /// The core has no next or previous command, only `cursor.jump`, and jumping deliberately
  /// stops: choosing a track and starting it are separate decisions there, so a jump alone
  /// would leave a chosen track sitting silent. Skipping is therefore a jump and a play, in
  /// that order, against the session the jump returned.
  ///
  /// Refusing to move past either end is the caller's guard as well as this one's, but it
  /// belongs here too: the core rejects an index outside the queue, and a skip button that
  /// throws at the last track is worse than one that is not offered.
  const skip = useCallback(
    (by: 1 | -1) => {
      hostFailure.current = undefined
      run(async () => {
        const on = session.current
        if (on === undefined || on.cursor === undefined) return
        const index = on.cursor + by
        if (index < 0 || index >= on.queue.length) return
        await playbackHost().execute(on.id, { _tag: "cursor.jump", payload: { index } })
        await command({ _tag: "transport.play", payload: {} })
      })
    },
    [command, playbackHost, run],
  )

  const next = useCallback(() => skip(1), [skip])
  const previous = useCallback(() => skip(-1), [skip])

  /// Move within the current track.
  ///
  // The shared host confirms native seek before the worker records the command.
  const seek = useCallback(
    (positionMs: number) => {
      run(async () => {
        await command({ _tag: "transport.seek", payload: { positionMs: Math.round(positionMs) } })
      })
    },
    [command, run],
  )

  const pause = useCallback(() => {
    const on = session.current
    if (on === undefined) return
    const paused = playbackHost().execute(on.id, { _tag: "transport.pause", payload: {} })
    // Reach the host immediately. Waiting behind the outer album operation would prevent
    // Pause from waking that operation's unresolved Play confirmation.
    void paused.catch(() => undefined)
    run(async () => {
      await paused
      await reportPosition()
    })
  }, [playbackHost, reportPosition, run])

  const attachAudio = useCallback(
    (element: HTMLAudioElement | null) => {
      audioElement.current = element
      playbackHost().attachAudio(element)
    },
    [playbackHost],
  )

  const refresh = useCallback(() => {
    void read()
  }, [read])

  /// Take a pushed session, if it is the one this device is rendering.
  ///
  /// Every session on the account arrives on the sessions topic, so something has to be
  /// refused here. Refusing by host was not enough, and the difference mattered: a device
  /// hosts several sessions, nothing prunes them, and each event about any of them replaced
  /// the one being rendered. Because this binding drives a real audio element, that was not
  /// a flickering label but a different album loading and starting, over and over.
  ///
  /// Reads select the session. Events never select it. The worker applies revision and
  /// pending-command rules before a record can reach the renderer. A raw server event
  /// during outbox replay describes historical intent, not what this device should play.
  const applySession = useCallback(
    (next: RpcSession) => {
      if (selectedId.current !== next.id) return
      const mine = generation.current
      const event = ++eventGeneration.current
      void edge
        .applySessionEvent(next)
        .then((result) => {
          if (selectedId.current !== next.id) return
          if (result.status === "queued") {
            if (
              pendingEvent.current === undefined ||
              next.revision >= pendingEvent.current.revision
            ) {
              pendingEvent.current = next
            }
            return
          }
          if (
            pendingCommands.current > 0 ||
            generation.current !== mine ||
            eventGeneration.current !== event
          )
            return
          publish(result.session.hostDeviceId === deviceId ? result.session : undefined)
        })
        .catch((cause: unknown) => {
          if (generation.current === mine) {
            setPlayback(
              unavailable({ kind: "failed", message: hostFailure.current ?? String(cause) }),
            )
          }
        })
    },
    [deviceId, edge, publish],
  )

  /// Carry out a command another device asked for.
  ///
  /// This device is the renderer, so a console cannot change the sound itself: it asks, and
  /// the host applies. Repeats are discarded by `directiveId`, which the contract provides
  /// for exactly this -- a socket that drops mid-delivery redelivers, and applying
  /// `queue.add` twice would put the album in the queue twice.
  const applyDirective = useCallback(
    (directive: RpcSessionDirective) => {
      const on = session.current
      // Addressed to a session this device is not hosting. The core routes by device, so
      // this means the world moved; asking for the truth beats guessing at it.
      if (on === undefined || on.id !== directive.sessionId) {
        void read()
        return
      }
      // Only Pause may enter the host before the outer album operation finishes.
      // Every other directive must follow the complete Clear/Add/Play sequence.
      const urgentPause =
        directive.command._tag === "transport.pause"
          ? playbackHost().applyDirective(directive)
          : undefined
      void urgentPause?.catch(() => undefined)
      run(async () => {
        const outcome = await (urgentPause ?? playbackHost().applyDirective(directive))
        if (
          directive.command._tag === "transport.play" &&
          outcome._tag === "Applied" &&
          !outcome.replayed &&
          outcome.session.transport === "playing"
        ) {
          hostFailure.current = undefined
          publish(session.current)
        }
      })
    },
    [playbackHost, publish, read, run],
  )

  return {
    playback,
    ...(audioUrl === undefined ? {} : { audioUrl }),
    attachAudio,
    reportEnded,
    reportDuration,
    playAlbum,
    play,
    pause,
    next,
    previous,
    seek,
    refresh,
    applySession,
    applyDirective,
  }
}
