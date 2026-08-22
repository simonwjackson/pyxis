import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { monotonicFactory } from "ulid"
import type {
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcPlacement,
  RpcPlugin,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"
import type { WorkerClient } from "../worker/client.ts"
import { spawnWorkerClient } from "../worker/client.ts"
import type { WorkerSettings } from "../worker/contract.ts"
import { createReferenceClient, type ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferenceOffline } from "./Offline.tsx"
import { ReferencePlugins } from "./Plugins.tsx"
import { type ConsoleCommand, type LocalState, ReferenceContext } from "./Reference.context.tsx"
import { ReferenceAudio } from "./ReferenceAudio.tsx"
import { ReferenceRemote } from "./Remote.tsx"
import { ReferenceSessions } from "./Sessions.tsx"
import { ReferenceUpdate } from "./Update.tsx"
import { createUpdateWatcher, type UpdateWatcher } from "./updates.ts"

const nextClientEventId = monotonicFactory()

const CONSOLE_COMMANDS: Record<ConsoleCommand, RpcSessionCommand> = {
  play: { _tag: "transport.play", payload: {} },
  pause: { _tag: "transport.pause", payload: {} },
  stop: { _tag: "transport.stop", payload: {} },
}

interface ReferenceAppProps {
  readonly client?: ReferenceClient
  /// Injected by tests. Omitted in the browser, where a real worker is spawned.
  readonly worker?: WorkerClient
  /// Injected by tests. Omitted in the browser, where the deployed shell is watched.
  readonly updates?: UpdateWatcher
  /// Injected by tests, because a test that genuinely reloads cannot assert anything.
  readonly reload?: () => void
  readonly children?: ReactNode
}

const liveClient = createReferenceClient()

export function ReferenceApp({
  client = liveClient,
  worker,
  updates,
  reload,
  children,
}: ReferenceAppProps) {
  // One worker owns the device data plane for the life of this app root. The composition
  // root injects the browser worker before StrictMode so React cannot start it twice.
  const [store] = useState<WorkerClient>(() => worker ?? spawnWorkerClient())
  const audioElement = useRef<HTMLAudioElement | null>(null)
  const placementQueues = useRef(new Map<string, Promise<void>>())
  const sessionWriteQueue = useRef<Promise<void>>(Promise.resolve())
  const syncQueue = useRef<Promise<void>>(Promise.resolve())
  const connectionQueue = useRef<Promise<void>>(Promise.resolve())
  const albumsRef = useRef<readonly RpcLibraryAlbum[]>([])
  const [status, setStatus] = useState<"booting" | "ready" | "busy" | "error">("booting")
  const [grant, setGrant] = useState<RpcAuthGrant>()
  const [plugins, setPlugins] = useState<readonly RpcPlugin[]>([])
  const [albums, setAlbums] = useState<readonly RpcLibraryAlbum[]>([])
  const [query, setQuery] = useState("")
  const [tracks, setTracks] = useState<readonly RpcSearchTrack[]>([])
  const [searchHasNoSources, setSearchHasNoSources] = useState(false)
  const [sourceFailures, setSourceFailures] = useState<readonly string[]>([])
  const [session, setSession] = useState<RpcSession>()
  const [remoteSessions, setRemoteSessions] = useState<readonly RpcSession[]>([])
  const [local, setLocal] = useState<LocalState>()
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const sessionRef = useRef<RpcSession>()
  const sessionOpening = useRef<Promise<RpcSession>>()
  const resumeTokenRef = useRef<string>()
  const appliedDirectives = useRef<string[]>([])
  const inFlightDirectives = useRef(new Set<string>())

  const applyWorkerAlbums = useCallback(async (): Promise<readonly RpcLibraryAlbum[]> => {
    const next = await store.albums()
    albumsRef.current = next
    setAlbums(next)
    setLocal((current) =>
      current === undefined ? current : { ...current, albumCount: next.length },
    )
    return next
  }, [store])

  const applyWorkerSessions = useCallback(async (): Promise<readonly RpcSession[]> => {
    const [settings, next] = await Promise.all([store.settings(), store.sessions()])
    const hosted = next.find((candidate) => candidate.hostDeviceId === settings.deviceId)
    sessionRef.current = hosted
    setSession(hosted)
    setRemoteSessions(
      next.filter(
        (candidate) => candidate.hostDeviceId !== settings.deviceId && candidate.reachable,
      ),
    )
    return next
  }, [store])

  const reconcileWorker = useCallback(async () => {
    const request = syncQueue.current
      .catch(() => undefined)
      .then(async () => {
        const report = await store.sync()
        const [, , settings] = await Promise.all([
          applyWorkerAlbums(),
          applyWorkerSessions(),
          store.settings(),
        ])
        setLocal((current) =>
          current === undefined
            ? current
            : {
                ...current,
                lastSync: report,
                notices: settings.syncNotices ?? current.notices,
              },
        )
        if (report.authRequired) setError("This device must be paired again.")
        else if (report.failure !== undefined) setError(report.failure)
        return report
      })
    syncQueue.current = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }, [applyWorkerAlbums, applyWorkerSessions, store])

  /// Which track the currently loaded audio URL belongs to. Reloading the same track
  /// would swap the element's src and silently reset it to the beginning.
  const loadedTrack = useRef<string>()
  const loadGeneration = useRef(0)
  /// In-flight load, so a double click or a StrictMode double-invoke cannot download the
  /// same track twice and swap the element's src out from under playback.
  const loading = useRef<{ trackId: string; promise: Promise<void> }>()
  /// Where freshly loaded audio should start. Consumed once, so it can never fight a
  /// manual seek later.
  const pendingSeekMs = useRef<number>()

  const persistHostCommand = useCallback(
    async (
      target: RpcSession,
      command: RpcSessionCommand,
      commandId?: string,
    ): Promise<RpcSession> => {
      const persisted = sessionWriteQueue.current
        .catch(() => undefined)
        .then(async () => {
          const current = (await store.session(target.id)) ?? target
          return store.queueSessionCommand(current, command, commandId)
        })
      sessionWriteQueue.current = persisted.then(
        () => undefined,
        () => undefined,
      )
      const optimistic = await persisted
      sessionRef.current = optimistic
      setSession((current) =>
        current !== undefined && current.revision > optimistic.revision ? current : optimistic,
      )
      return optimistic
    },
    [store],
  )

  const connectAccount = useCallback(async () => {
    const request = connectionQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          setError(undefined)
          const settings = await store.settings()
          let nextGrant = grantFromSettings(settings)
          if (nextGrant === undefined) {
            nextGrant = await client.claimDevice("reference browser")
            await store.writeSettings({
              accountId: nextGrant.account.id,
              accountName: nextGrant.account.name,
              accountIsDefault: nextGrant.account.isDefault,
              accountCreatedAt: nextGrant.account.createdAt,
              bearerToken: nextGrant.bearerToken,
              deviceId: nextGrant.device.id,
              deviceName: nextGrant.device.name,
            })
          }

          const syncReport = await reconcileWorker()
          if (syncReport.authRequired) throw new Error("This device must be paired again.")
          const needsPageFallback =
            (await store.open()).ephemeral === true && syncReport.pageFallbackRequired === true
          const [nextPlugins, fallbackAlbums, fallbackSessions] = await Promise.all([
            client.listPlugins(nextGrant.bearerToken),
            needsPageFallback
              ? client.listAlbums(nextGrant.bearerToken)
              : Promise.resolve(undefined),
            needsPageFallback
              ? client.listSessions(nextGrant.bearerToken, true)
              : Promise.resolve(undefined),
          ])
          if (fallbackAlbums !== undefined) {
            // A browser without workers cannot run the worker's RPC client. Keep the online
            // product usable, while the open report still says that nothing persists.
            await store.replaceAlbums(fallbackAlbums)
            await applyWorkerAlbums()
          }
          if (fallbackSessions !== undefined) {
            for (const session of fallbackSessions) await store.putSession(session)
            await applyWorkerSessions()
          }
          // Realtime makes the device reachable. Publish the grant only after the hosted
          // session is in memory, so a console can never dispatch into an empty boot gap.
          setGrant(nextGrant)
          setPlugins(nextPlugins)
          setStatus("ready")
        } catch (cause) {
          setError(message(cause))
          setStatus("error")
          throw cause
        }
      })
    connectionQueue.current = request.then(
      () => undefined,
      () => undefined,
    )
    return request
  }, [applyWorkerAlbums, applyWorkerSessions, client, reconcileWorker, store])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    const watcher = updates ?? createUpdateWatcher()
    return watcher.start(() => setUpdateAvailable(true))
  }, [updates])

  const applyUpdate = useCallback(() => {
    // A plain reload is enough now that the shell is never stored. The browser asks the
    // server for it, gets the new bundle names, and loads them.
    if (reload !== undefined) reload()
    else window.location.reload()
  }, [reload])

  // Read the durable copy before touching the network. The same connection function is
  // retried by the browser's online event, including when the first claim happened offline.
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const report = await store.open()
        const [settings, albums] = await Promise.all([store.settings(), store.albums()])
        if (!live) return
        albumsRef.current = albums
        resumeTokenRef.current = settings.resumeToken
        setAlbums(albums)
        setLocal({
          report,
          ...(settings.deviceId === undefined ? {} : { deviceId: settings.deviceId }),
          albumCount: albums.length,
          notices: settings.syncNotices ?? [],
        })
        await connectAccount()
      } catch {
        // connectAccount reports the actionable error. Cached data stays usable.
      }
    })()
    return () => {
      live = false
      if (worker === undefined) store.terminate()
    }
  }, [connectAccount, store, worker])

  // The realtime socket is also what makes this device reachable, so a console can drive
  // it. Without a live socket the core correctly reports this session as uncontrollable.
  useEffect(() => {
    if (grant === undefined) return
    const token = grant.bearerToken
    const deviceId = grant.device.id
    return client.connectRealtime(
      token,
      {
        onEvent: async (event) => {
          const state = event.state
          if (state._tag === "session.state") {
            const updated = state.payload
            if (updated.hostDeviceId === deviceId) {
              const report = await reconcileWorker()
              if (report.sessionPullFailed) throw new Error("session state did not sync")
              return
            }
            await store.putSession(updated)
            setRemoteSessions((current) => {
              const existing = current.find((candidate) => candidate.id === updated.id)
              if (existing !== undefined && existing.revision >= updated.revision) return current
              const others = current.filter((candidate) => candidate.id !== updated.id)
              return updated.reachable ? [...others, updated] : others
            })
            return
          }
          // Pull album state through the worker even while a local placement is queued. Its
          // merge rules preserve that intent, and the cursor is stored only after this ends.
          const report = await reconcileWorker()
          if (report.albumPullFailed) throw new Error("album state did not sync")
        },
        onResync: async () => {
          // The server said the replay was incomplete. Refetch through the worker, which is
          // the only layer that knows which local session and album writes are still queued.
          const report = await reconcileWorker()
          if (report.albumPullFailed || report.sessionPullFailed) {
            throw new Error("realtime resync did not complete")
          }
        },
        onResumeToken: async (resumeToken) => {
          await store.writeSettings({ resumeToken })
          resumeTokenRef.current = resumeToken
        },
        onDirective: (directive) => {
          // A reconnect can redeliver a directive. Persist it under the directive ID before
          // marking it applied, so a failed local write remains retryable and a page reload
          // cannot apply `queue.add` twice.
          const directiveKey = `${directive.sessionId}:${directive.directiveId}`
          if (
            appliedDirectives.current.includes(directiveKey) ||
            inFlightDirectives.current.has(directiveKey)
          ) {
            return
          }
          const current =
            sessionRef.current?.id === directive.sessionId ? sessionRef.current : undefined
          if (current === undefined) {
            setError("directed session is not in the local store")
            return
          }
          inFlightDirectives.current.add(directiveKey)
          const persisted = persistHostCommand(current, directive.command, directive.directiveId)
          void (async () => {
            try {
              await persisted
              appliedDirectives.current = [...appliedDirectives.current.slice(-511), directiveKey]
              await reconcileWorker()
            } catch (cause) {
              setError(message(cause))
            } finally {
              inFlightDirectives.current.delete(directiveKey)
            }
          })()
        },
      },
      resumeTokenRef.current,
    )
  }, [client, grant, persistHostCommand, reconcileWorker, store])

  useEffect(() => {
    const onOnline = () => {
      void connectAccount().catch(() => undefined)
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [connectAccount])

  useEffect(
    () => () => {
      if (audioUrl !== undefined && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(audioUrl)
      }
    },
    [audioUrl],
  )

  useEffect(() => {
    const audio = audioElement.current
    if (audio === null) return
    if (session?.transport === "playing" && audioUrl !== undefined) {
      // Freshly loaded audio starts at zero even when the session is mid-track, which is
      // what a reload or a handoff looks like. Consumed once: a later manual rewind is the
      // listener's decision, not something to undo.
      const resumeFrom = pendingSeekMs.current
      pendingSeekMs.current = undefined
      if (resumeFrom !== undefined && resumeFrom > 0) audio.currentTime = resumeFrom / 1000
      void audio.play().catch(() => {
        setError("Browser blocked autoplay. Use the native audio control once.")
      })
    } else {
      audio.pause()
      if (session?.transport === "stopped") audio.currentTime = 0
    }
  }, [audioUrl, session?.transport])

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    setStatus("busy")
    setError(undefined)
    try {
      const value = await operation()
      setStatus("ready")
      return value
    } catch (cause) {
      setError(message(cause))
      setStatus("error")
      return undefined
    }
  }, [])

  const currentToken = useCallback((): string => {
    if (grant === undefined) throw new Error("device has not claimed an account")
    return grant.bearerToken
  }, [grant])

  const ensureSession = useCallback(async (): Promise<RpcSession> => {
    const current = sessionRef.current ?? session
    if (current !== undefined) return current
    sessionOpening.current ??= (async () => {
      const created = await client.createSession(currentToken(), "Reference browser")
      await store.putSession(created)
      sessionRef.current = created
      setSession(created)
      return created
    })().finally(() => {
      sessionOpening.current = undefined
    })
    return sessionOpening.current
  }, [client, currentToken, session, store])

  const runHostCommand = useCallback(
    async (target: RpcSession, command: RpcSessionCommand): Promise<RpcSession> => {
      const optimistic = await persistHostCommand(target, command)
      await reconcileWorker()
      return (await store.session(target.id)) ?? optimistic
    },
    [persistHostCommand, reconcileWorker, store],
  )

  const search = useCallback(async () => {
    if (query.trim().length === 0) return
    await run(async () => {
      const result = await client.search(currentToken(), query)
      setTracks(result.tracks)
      setSearchHasNoSources(result.noSources)
      setSourceFailures(result.failures)
    })
  }, [client, currentToken, query, run])

  const enqueue = useCallback(
    async (trackId: string) => {
      await run(async () => {
        const target = await ensureSession()
        setSession(
          await runHostCommand(target, {
            _tag: "queue.add",
            payload: { trackIds: [trackId] },
          }),
        )
      })
    },
    [ensureSession, run, runHostCommand],
  )

  const enqueueAlbum = useCallback(
    async (albumId: string) => {
      await run(async () => {
        const album = albumsRef.current.find((candidate) => candidate.id === albumId)
        if (album === undefined) throw new Error("album is not in the library")
        if (album.tracks.length === 0) throw new Error("album has no tracks")
        const target = await ensureSession()
        // One command, so the album lands in the queue in order and as one revision.
        setSession(
          await runHostCommand(target, {
            _tag: "queue.add",
            payload: { trackIds: album.tracks.map((track) => track.id) },
          }),
        )
      })
    },
    [ensureSession, run, runHostCommand],
  )

  const setAlbumPlacement = useCallback(
    async (albumId: string, placement: RpcPlacement) => {
      const album = albumsRef.current.find((candidate) => candidate.id === albumId)
      if (album === undefined) return
      const optimistic = albumsRef.current.map((candidate) =>
        candidate.id === albumId ? { ...candidate, placement } : candidate,
      )
      albumsRef.current = optimistic
      setAlbums(optimistic)

      await run(async () => {
        const previous = placementQueues.current.get(albumId) ?? Promise.resolve()
        // Serialize durable local writes for this album, but never make a later click wait
        // for an earlier network request. A closed tab must not lose intent that was
        // already visible on screen.
        const persisted = previous
          .catch(() => undefined)
          .then(() => store.queuePlacement(album, placement))
        const queued = persisted.then(
          () => undefined,
          () => undefined,
        )
        placementQueues.current.set(albumId, queued)
        try {
          await persisted
          await reconcileWorker()
        } finally {
          if (placementQueues.current.get(albumId) === queued) {
            placementQueues.current.delete(albumId)
          }
        }
      })
    },
    [reconcileWorker, run, store],
  )

  /// Load audio only when the track actually changed. Resuming reuses the loaded element,
  /// which is what preserves the playback position.
  const loadAudioFor = useCallback(
    async (trackId: string) => {
      if (loadedTrack.current === trackId && audioUrl !== undefined) return
      const inFlight = loading.current
      if (inFlight?.trackId === trackId) {
        await inFlight.promise
        return
      }
      const generation = loadGeneration.current + 1
      loadGeneration.current = generation
      const promise = (async () => {
        const nextAudioUrl = await client.loadStream(currentToken(), trackId)
        if (loadGeneration.current !== generation) {
          if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(nextAudioUrl)
          return
        }
        loadedTrack.current = trackId
        pendingSeekMs.current = sessionRef.current?.positionMs ?? 0
        setAudioUrl(nextAudioUrl)
      })()
      loading.current = { trackId, promise }
      try {
        await promise
      } finally {
        if (loading.current?.promise === promise) loading.current = undefined
      }
    },
    [audioUrl, client, currentToken],
  )

  /// Tell the core where this host actually is. Only the host knows, and without it a
  /// console or a handoff would resume every track from zero.
  const reportPosition = useCallback(
    async (target: RpcSession) => {
      const positionMs = Math.round((audioElement.current?.currentTime ?? 0) * 1000)
      if (positionMs <= 0) return
      setSession(
        await runHostCommand(target, {
          _tag: "position.report",
          payload: { positionMs },
        }),
      )
    },
    [runHostCommand],
  )

  const play = useCallback(async () => {
    await run(async () => {
      const target = await ensureSession()
      if (target.currentTrackId === undefined) throw new Error("queue is empty")
      await loadAudioFor(target.currentTrackId)
      setSession(
        await runHostCommand(target, {
          _tag: "transport.play",
          payload: {},
        }),
      )
    })
  }, [ensureSession, loadAudioFor, run, runHostCommand])

  const pause = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      const paused = await runHostCommand(session, {
        _tag: "transport.pause",
        payload: {},
      })
      setSession(paused)
      await reportPosition(paused)
    })
  }, [reportPosition, run, runHostCommand, session])

  const stop = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      setSession(
        await runHostCommand(session, {
          _tag: "transport.stop",
          payload: {},
        }),
      )
      loadGeneration.current += 1
      loadedTrack.current = undefined
      pendingSeekMs.current = undefined
      setAudioUrl(undefined)
    })
  }, [run, runHostCommand, session])

  const clearQueue = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      setSession(
        await runHostCommand(session, {
          _tag: "queue.clear",
          payload: {},
        }),
      )
      loadGeneration.current += 1
      loadedTrack.current = undefined
      pendingSeekMs.current = undefined
      setAudioUrl(undefined)
    })
  }, [run, runHostCommand, session])

  const reportEnded = useCallback(async () => {
    if (session === undefined || grant === undefined || session.currentTrackId === undefined) return
    try {
      const track = tracks.find((candidate) => candidate.id === session.currentTrackId)
      const playedMs = Math.min(
        Math.round((audioElement.current?.duration ?? 0) * 1000),
        0xffffffff,
      )
      await store.queueListen({
        id: nextClientEventId(),
        trackId: session.currentTrackId,
        deviceId: grant.device.id,
        ...(track?.sourcePluginId === undefined ? {} : { sourcePluginId: track.sourcePluginId }),
        listenedAt: new Date().toISOString(),
        ...(playedMs === 0 ? {} : { playedMs }),
        completed: true,
        context: "queue",
        contextId: session.id,
      })
      await persistHostCommand(session, {
        _tag: "transport.trackEnded",
        payload: {},
      })
      await reconcileWorker()
    } catch (cause) {
      // A simultaneous pause or stop can make the ended report stale. The listen remains
      // durable, and the audio callback never leaks an unhandled promise rejection.
      setError(message(cause))
      setStatus("error")
    }
  }, [grant, persistHostCommand, reconcileWorker, session, store, tracks])

  const driveRemote = useCallback(
    async (sessionId: string, command: ConsoleCommand) => {
      await run(async () => {
        await client.sendCommand(
          currentToken(),
          sessionId,
          CONSOLE_COMMANDS[command],
          nextClientEventId(),
        )
      })
    },
    [client, currentToken, run],
  )

  const handOffTo = useCallback(
    async (targetSessionId: string) => {
      const source = session
      if (source === undefined) return
      await run(async () => {
        await client.handoff(currentToken(), source.id, targetSessionId)
        setAudioUrl(undefined)
      })
    },
    [client, currentToken, run, session],
  )

  // Whatever is playing must be loaded, whoever asked for it. A console can start this
  // device, and a reload can find it already playing.
  useEffect(() => {
    const trackId = session?.currentTrackId
    if (session?.transport !== "playing" || trackId === undefined) return
    if (loadedTrack.current === trackId && audioUrl !== undefined) return
    void loadAudioFor(trackId).catch((cause: unknown) => setError(message(cause)))
  }, [audioUrl, loadAudioFor, session?.currentTrackId, session?.transport])

  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audioElement.current = element
  }, [])

  const context = useMemo(
    () => ({
      status,
      ...(grant === undefined ? {} : { grant }),
      plugins,
      albums,
      query,
      tracks,
      searchHasNoSources,
      sourceFailures,
      ...(session === undefined ? {} : { session }),
      remoteSessions,
      ...(local === undefined ? {} : { local }),
      updateAvailable,
      applyUpdate,
      ...(audioUrl === undefined ? {} : { audioUrl }),
      ...(error === undefined ? {} : { error }),
      setQuery,
      search,
      enqueue,
      enqueueAlbum,
      setAlbumPlacement,
      play,
      pause,
      stop,
      clearQueue,
      reportEnded,
      driveRemote,
      handOffTo,
      attachAudio,
    }),
    [
      status,
      grant,
      plugins,
      albums,
      query,
      tracks,
      searchHasNoSources,
      sourceFailures,
      session,
      remoteSessions,
      local,
      updateAvailable,
      applyUpdate,
      audioUrl,
      error,
      search,
      enqueue,
      enqueueAlbum,
      setAlbumPlacement,
      play,
      pause,
      stop,
      clearQueue,
      reportEnded,
      driveRemote,
      handOffTo,
      attachAudio,
    ],
  )

  return (
    <ReferenceContext.Provider value={context}>
      {children ?? (
        <main>
          <h1>Pyxis reference client</h1>
          <p>This page is intentionally unstyled. It proves behavior, not design.</p>
          <ReferenceUpdate />
          <ReferencePlugins />
          <ReferenceLibrary />
          <ReferenceSessions />
          <ReferenceOffline />
          <ReferenceRemote />
          <ReferenceConsole />
          <ReferenceAudio />
        </main>
      )}
    </ReferenceContext.Provider>
  )
}

function grantFromSettings(settings: WorkerSettings): RpcAuthGrant | undefined {
  if (
    settings.accountId === undefined ||
    settings.accountName === undefined ||
    settings.accountIsDefault === undefined ||
    settings.accountCreatedAt === undefined ||
    settings.deviceId === undefined ||
    settings.deviceName === undefined ||
    settings.bearerToken === undefined
  ) {
    return undefined
  }
  return {
    account: {
      id: settings.accountId,
      name: settings.accountName,
      isDefault: settings.accountIsDefault,
      createdAt: settings.accountCreatedAt,
    },
    device: { id: settings.deviceId, name: settings.deviceName },
    bearerToken: settings.bearerToken,
  }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown error"
}
