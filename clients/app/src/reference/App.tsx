import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { monotonicFactory } from "ulid"
import type {
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcOutputTopology,
  RpcPlacement,
  RpcPlugin,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
  RpcSourceAlbumSummary,
  RpcSourceArtistSummary,
  RpcStation,
} from "../../../../contracts/generated/pyxis"
import { StationSeedKind } from "../../../../contracts/generated/pyxis"
import { type ConfirmedPlaybackHost, createConfirmedPlaybackHost } from "../playback/confirmed-host"
import type { WorkerClient } from "../worker/client.ts"
import { spawnWorkerClient } from "../worker/client.ts"
import type { OfflineOverview, WorkerSettings } from "../worker/contract.ts"
import { createReferenceClient, type ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferenceOffline } from "./Offline.tsx"
import { ReferenceOutputs } from "./Outputs.tsx"
import { ReferencePlugins } from "./Plugins.tsx"
import { ReferencePlaylists } from "./Playlists.tsx"
import { type ConsoleCommand, type LocalState, ReferenceContext } from "./Reference.context.tsx"
import { ReferenceAudio } from "./ReferenceAudio.tsx"
import { ReferenceRemote } from "./Remote.tsx"
import { ReferenceSessions } from "./Sessions.tsx"
import { ReferenceStations } from "./Stations.tsx"
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
  const syncQueue = useRef<Promise<void>>(Promise.resolve())
  const connectionQueue = useRef<Promise<void>>(Promise.resolve())
  const albumsRef = useRef<readonly RpcLibraryAlbum[]>([])
  const [status, setStatus] = useState<"booting" | "ready" | "busy" | "error">("booting")
  const [grant, setGrant] = useState<RpcAuthGrant>()
  const grantRef = useRef(grant)
  grantRef.current = grant
  const [plugins, setPlugins] = useState<readonly RpcPlugin[]>([])
  const [outputs, setOutputs] = useState<readonly RpcOutputTopology[]>([])
  const [albums, setAlbums] = useState<readonly RpcLibraryAlbum[]>([])
  const [query, setQuery] = useState("")
  const [tracks, setTracks] = useState<readonly RpcSearchTrack[]>([])
  const [sourceAlbums, setSourceAlbums] = useState<readonly RpcSourceAlbumSummary[]>([])
  const [sourceArtists, setSourceArtists] = useState<readonly RpcSourceArtistSummary[]>([])
  const [searchHasNoSources, setSearchHasNoSources] = useState(false)
  const [sourceFailures, setSourceFailures] = useState<readonly string[]>([])
  const [stations, setStations] = useState<readonly RpcStation[]>([])
  const [stationsHaveNoSources, setStationsHaveNoSources] = useState(false)
  const [stationFailures, setStationFailures] = useState<readonly string[]>([])
  const [session, setSession] = useState<RpcSession>()
  const [remoteSessions, setRemoteSessions] = useState<readonly RpcSession[]>([])
  const [local, setLocal] = useState<LocalState>()
  const [offline, setOffline] = useState<OfflineOverview>()
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [retainedHostFailure, setRetainedHostFailure] = useState<string>()
  const [realtimeError, setRealtimeError] = useState<string>()
  const sessionRef = useRef<RpcSession>()
  const sessionOpening = useRef<Promise<RpcSession>>()
  const resumeTokenRef = useRef<string>()
  const streamEpochRef = useRef(0)
  const offlinePollGeneration = useRef(0)
  const sessionPublicationGeneration = useRef(0)

  const applyWorkerAlbums = useCallback(async (): Promise<readonly RpcLibraryAlbum[]> => {
    const next = await store.albums()
    albumsRef.current = next
    setAlbums(next)
    setLocal((current) =>
      current === undefined ? current : { ...current, albumCount: next.length },
    )
    return next
  }, [store])

  const applyWorkerSessions = useCallback(
    async (
      remoteReachabilityIsLive: boolean,
      knownSettings?: WorkerSettings,
      publicationGeneration = sessionPublicationGeneration.current,
    ): Promise<readonly RpcSession[]> => {
      const [settings, next] = await Promise.all([
        knownSettings ?? store.settings(),
        store.sessions(),
      ])
      // Let durable work settle, but never let an older observation undo a failure clamp
      // or supersede authority received on the replacement connection.
      if (publicationGeneration !== sessionPublicationGeneration.current) return next
      const hosted = next.find((candidate) => candidate.hostDeviceId === settings.deviceId)
      sessionRef.current = hosted
      setSession(hosted)
      // Keep known outputs visible without treating cached reachability as live. Browser
      // hosts still require a current reachability observation before appearing here.
      setRemoteSessions(
        next
          .filter(
            (candidate) =>
              candidate.hostDeviceId !== settings.deviceId &&
              (candidate.output !== undefined || (remoteReachabilityIsLive && candidate.reachable)),
          )
          .map((candidate) =>
            remoteReachabilityIsLive ? candidate : { ...candidate, reachable: false },
          ),
      )
      return next
    },
    [store],
  )

  const watchOffline = useCallback(
    (initial: OfflineOverview) => {
      offlinePollGeneration.current += 1
      const generation = offlinePollGeneration.current
      setOffline(initial)
      if (!initial.albums.some((album) => album.state === "downloading")) return
      const poll = async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))
        if (offlinePollGeneration.current !== generation) return
        try {
          const next = await store.offlineOverview()
          if (offlinePollGeneration.current !== generation) return
          setOffline(next)
          if (next.albums.some((album) => album.state === "downloading")) void poll()
        } catch {
          // Offline status is best-effort UI reporting. The durable pin and manager keep
          // running even if this page closes or one poll loses its worker response.
        }
      }
      void poll()
    },
    [store],
  )

  const reconcileWorker = useCallback(
    async (scope: "all" | "sessions" = "all") => {
      const publicationGeneration = sessionPublicationGeneration.current
      const request = syncQueue.current
        .catch(() => undefined)
        .then(async () => {
          const report = await (scope === "sessions" ? store.syncSessions() : store.sync())
          const settings = await store.settings()
          await Promise.all([
            scope === "all" ? applyWorkerAlbums() : undefined,
            applyWorkerSessions(report.sessionPullFailed !== true, settings, publicationGeneration),
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
    },
    [applyWorkerAlbums, applyWorkerSessions, store],
  )

  const hostSlot = useMemo(
    () => ({
      current: undefined as ConfirmedPlaybackHost | undefined,
      create: () =>
        createConfirmedPlaybackHost({
          store,
          selectedSession: () => sessionRef.current,
          deviceId: () => grantRef.current?.device.id,
          loadStream: (trackId) => {
            const auth = grantRef.current
            if (auth === undefined) throw new Error("device has not claimed an account")
            return client.loadStream(auth.bearerToken, trackId, {
              accountId: auth.account.id,
              deviceId: auth.device.id,
              streamEpoch: streamEpochRef.current,
            })
          },
          publishSession: (next) => {
            sessionRef.current = next
            setSession((current) =>
              current !== undefined && current.revision > next.revision ? current : next,
            )
          },
          publishAudioUrl: setAudioUrl,
          reportFailure: (cause) => {
            setRetainedHostFailure(message(cause))
          },
          requestSessionSync: () => {
            void reconcileWorker("sessions").catch((cause: unknown) => {
              setError(message(cause))
              setStatus("error")
            })
          },
          newCommandId: nextClientEventId,
        }),
    }),
    [client, reconcileWorker, store],
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

  const persistHostCommand = useCallback(
    async (
      target: RpcSession,
      command: RpcSessionCommand,
      commandId?: string,
    ): Promise<RpcSession> => {
      try {
        const outcome = await playbackHost().execute(target.id, command, commandId)
        if (
          command._tag === "transport.play" &&
          outcome._tag === "Applied" &&
          !outcome.replayed &&
          outcome.session.transport === "playing"
        ) {
          setRetainedHostFailure(undefined)
          setError(undefined)
          setStatus("ready")
        }
        return outcome.session
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError"))
          setRetainedHostFailure(message(cause))
        throw cause
      }
    },
    [playbackHost],
  )

  const connectAccount = useCallback(async () => {
    const request = connectionQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          setError(undefined)
          const settings = await store.settings()
          streamEpochRef.current = settings.streamEpoch ?? 0
          let nextGrant = grantFromSettings(settings)
          if (nextGrant === undefined) {
            nextGrant = await client.claimDevice("reference browser")
            const written = await store.writeSettings({
              accountId: nextGrant.account.id,
              accountName: nextGrant.account.name,
              accountIsDefault: nextGrant.account.isDefault,
              accountCreatedAt: nextGrant.account.createdAt,
              bearerToken: nextGrant.bearerToken,
              deviceId: nextGrant.device.id,
              deviceName: nextGrant.device.name,
            })
            streamEpochRef.current = written.streamEpoch ?? streamEpochRef.current
          }

          // Cached sessions were loaded before this connection attempt. Publish the durable
          // grant before any network request so a cold offline boot can play pinned audio
          // immediately without waiting for an RPC timeout.
          setGrant(nextGrant)
          const syncReport = await reconcileWorker()
          if (syncReport.authRequired) throw new Error("This device must be paired again.")
          const needsPageFallback =
            (await store.open()).ephemeral === true && syncReport.pageFallbackRequired === true
          const publicationGeneration = sessionPublicationGeneration.current
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
            await applyWorkerSessions(true, undefined, publicationGeneration)
          }
          setPlugins(nextPlugins)
          setStatus("ready")
          // Resume durable pins after the page is usable. Large albums must not delay the
          // realtime socket that makes this host reachable.
          void store
            .resumeOffline()
            .then(watchOffline)
            .catch((cause: unknown) => setError(message(cause)))
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
  }, [applyWorkerAlbums, applyWorkerSessions, client, reconcileWorker, store, watchOffline])

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
        // Bind this page to one account before any account-scoped read. Otherwise a
        // simultaneous switch in another tab can mix settings from one account with albums
        // or cache metadata from another.
        const settings = await store.settings()
        const albums = await store.albums()
        if (!live) return
        albumsRef.current = albums
        resumeTokenRef.current = settings.resumeToken
        streamEpochRef.current = settings.streamEpoch ?? 0
        setAlbums(albums)
        setLocal({
          report,
          ...(settings.deviceId === undefined ? {} : { deviceId: settings.deviceId }),
          albumCount: albums.length,
          notices: settings.syncNotices ?? [],
        })
        await applyWorkerSessions(false)
        try {
          await connectAccount()
        } catch {
          // Online readiness owns the cross-tab database lock first. If the network is
          // unavailable, inspect cached media afterward so cold offline playback remains
          // visible without letting a large cache scan starve account/session startup.
          void store
            .offlineOverview()
            .catch((): OfflineOverview => ({ available: false, albums: [], totalBytes: 0 }))
            .then((overview) => {
              if (live) watchOffline(overview)
            })
        }
      } catch {
        // Opening the durable local copy failed. The worker reports its recovery state.
      }
    })()
    return () => {
      live = false
      offlinePollGeneration.current += 1
      if (worker === undefined) store.terminate()
    }
  }, [applyWorkerSessions, connectAccount, store, watchOffline, worker])

  // The realtime socket is also what makes this device reachable, so a console can drive
  // it. Without a live socket the core correctly reports this session as uncontrollable.
  useEffect(() => {
    if (grant === undefined) return
    const token = grant.bearerToken
    const deviceId = grant.device.id
    let generation = 0
    const disconnect = client.connectRealtime(
      token,
      {
        onConnected: () => setRealtimeError(undefined),
        onFailure: (cause) => {
          generation += 1
          sessionPublicationGeneration.current += 1
          setRealtimeError(`Realtime connection failed: ${message(cause)}`)
          setRemoteSessions((current) =>
            current
              .filter((candidate) => candidate.output !== undefined)
              .map((candidate) => ({ ...candidate, reachable: false })),
          )
        },
        onEvent: async (event) => {
          const state = event.state
          if (state._tag === "session.state") {
            // The event already carries the authoritative session. A full library sync
            // here blocks the realtime lane (and its next transport directive) for seconds.
            // The worker applies this one snapshot atomically and protects queued intent.
            const eventGeneration = generation
            const checkConnection = () => {
              if (generation !== eventGeneration)
                throw new Error("session event connection retired")
            }
            let applied = await store.applySessionEvent(state.payload)
            checkConnection()
            if (applied.status === "queued") {
              // Keep the event until the in-flight command acknowledgement has finished;
              // otherwise that older reply can overwrite it after its cursor was saved.
              await syncQueue.current
              checkConnection()
              applied = await store.applySessionEvent(state.payload)
              checkConnection()
              if (applied.status === "queued") {
                await reconcileWorker("sessions")
                checkConnection()
                applied = await store.applySessionEvent(state.payload)
                checkConnection()
              }
              if (applied.status === "queued")
                throw new Error("session event still has queued intent")
            }
            const updated = applied.session
            if (updated.hostDeviceId === deviceId) {
              // A device can host multiple sessions. An event for another one must not
              // steal this page's selected renderer.
              if (sessionRef.current !== undefined && sessionRef.current.id !== updated.id) return
              if (
                sessionRef.current === undefined ||
                sessionRef.current.revision <= updated.revision
              ) {
                sessionRef.current = updated
              }
              setSession((current) =>
                current !== undefined && current.revision > updated.revision ? current : updated,
              )
              return
            }
            setRemoteSessions((current) => {
              const existing = current.find((candidate) => candidate.id === updated.id)
              if (existing !== undefined && existing.revision > updated.revision) return current
              const others = current.filter((candidate) => candidate.id !== updated.id)
              return updated.output !== undefined || updated.reachable
                ? [...others, updated]
                : others
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
          if (sessionRef.current?.id !== directive.sessionId) {
            setError("directed session is not in the local store")
            return
          }
          const deviceId = grantRef.current?.device.id
          const current = () =>
            sessionRef.current?.id === directive.sessionId &&
            grantRef.current?.device.id === deviceId
          void playbackHost()
            .applyDirective(directive)
            .then((outcome) => {
              if (!current()) return
              if (
                directive.command._tag === "transport.play" &&
                outcome._tag === "Applied" &&
                !outcome.replayed &&
                outcome.session.transport === "playing"
              ) {
                setRetainedHostFailure(undefined)
                setError(undefined)
                setStatus("ready")
              }
              return reconcileWorker("sessions").catch((cause: unknown) => {
                if (current()) {
                  setError(message(cause))
                  setStatus("error")
                }
              })
            })
            .catch((cause: unknown) => {
              if (current() && !(cause instanceof DOMException && cause.name === "AbortError"))
                setRetainedHostFailure(message(cause))
            })
        },
      },
      resumeTokenRef.current,
    )
    return () => {
      generation += 1
      sessionPublicationGeneration.current += 1
      disconnect()
    }
  }, [client, grant, playbackHost, reconcileWorker, store])

  useEffect(() => {
    const onOnline = () => {
      void connectAccount().catch(() => undefined)
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [connectAccount])

  useEffect(() => {
    playbackHost().renderSession(session)
  }, [playbackHost, session])

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    setStatus("busy")
    setError(undefined)
    try {
      const value = await operation()
      setStatus("ready")
      return value
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return undefined
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
      await reconcileWorker("sessions")
      return (await store.session(target.id)) ?? optimistic
    },
    [persistHostCommand, reconcileWorker, store],
  )

  const runConfirmedHostCommand = runHostCommand

  const search = useCallback(async () => {
    if (query.trim().length === 0) return
    await run(async () => {
      const result = await client.search(currentToken(), query)
      setTracks(result.tracks)
      setSourceAlbums(result.albums)
      setSourceArtists(result.artists)
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

  const loadStations = useCallback(async () => {
    await run(async () => {
      const result = await client.listStations(currentToken())
      setStations(result.stations)
      setStationsHaveNoSources(result.noSources)
      setStationFailures(result.failures)
    })
  }, [client, currentToken, run])

  // Queueing a batch is the same work whichever way the station was found, so both entry
  // points share it rather than drifting apart.
  const queueStationBatch = useCallback(
    async (pluginId: string, stationId: string) => {
      const batch = await client.nextStationBatch(currentToken(), pluginId, stationId)
      if (batch.tracks.length === 0) return
      const target = await ensureSession()
      setSession(
        await runHostCommand(target, {
          _tag: "queue.add",
          payload: { trackIds: batch.tracks.map((track) => track.id) },
        }),
      )
    },
    [client, currentToken, ensureSession, runHostCommand],
  )

  const startStationFromTrack = useCallback(
    async (pluginId: string, trackExternalId: string) => {
      await run(async () => {
        const station = await client.createStation(currentToken(), pluginId, trackExternalId)
        await queueStationBatch(station.sourcePluginId, station.externalId)
      })
    },
    [client, currentToken, queueStationBatch, run],
  )

  // Only sources that declared a `track` seed in their manifest can start a station from a
  // song. Reading the published declaration means the client never probes an operation to
  // discover it is missing.
  const trackSeedSources = useMemo(
    () =>
      plugins
        .filter((plugin) => plugin.stationSeedKinds?.includes(StationSeedKind.Track) === true)
        .map((plugin) => plugin.id),
    [plugins],
  )

  const startStation = useCallback(
    async (pluginId: string, stationId: string) => {
      // The batch is queued and nothing else. Play stays a separate, explicit command, so
      // asking a source what comes next can never start audio on its own.
      await run(async () => {
        await queueStationBatch(pluginId, stationId)
      })
    },
    [queueStationBatch, run],
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

  const enqueueAlbumOnSession = useCallback(
    async (sessionId: string, albumId: string) => {
      await run(async () => {
        const album = albumsRef.current.find((candidate) => candidate.id === albumId)
        if (album === undefined) throw new Error("album is not in the library")
        if (album.tracks.length === 0) throw new Error("album has no tracks")
        await client.sendCommand(
          currentToken(),
          sessionId,
          { _tag: "queue.add", payload: { trackIds: album.tracks.map((track) => track.id) } },
          nextClientEventId(),
        )
        await reconcileWorker()
      })
    },
    [client, currentToken, reconcileWorker, run],
  )

  const clearOutputQueue = useCallback(
    async (sessionId: string) => {
      await run(async () => {
        await client.sendCommand(
          currentToken(),
          sessionId,
          { _tag: "queue.clear", payload: {} },
          nextClientEventId(),
        )
        await reconcileWorker()
      })
    },
    [client, currentToken, reconcileWorker, run],
  )

  const discoverOutput = useCallback(
    async (pluginId: string) => {
      await run(async () => {
        const topology = await client.listOutputTargets(currentToken(), pluginId)
        setOutputs((current) => [
          ...current.filter((candidate) => candidate.pluginId !== pluginId),
          topology,
        ])
        await reconcileWorker()
      })
    },
    [client, currentToken, reconcileWorker, run],
  )

  const createOutputSession = useCallback(
    async (pluginId: string, targetId: string, name: string) => {
      await run(async () => {
        const publicationGeneration = sessionPublicationGeneration.current
        const created = await client.createOutputSession(currentToken(), pluginId, targetId, name)
        await store.putSession(created)
        await applyWorkerSessions(true, undefined, publicationGeneration)
      })
    },
    [applyWorkerSessions, client, currentToken, run, store],
  )

  const setOutputGroup = useCallback(
    async (pluginId: string, coordinatorId: string, memberIds: readonly string[]) => {
      await run(async () => {
        const topology = await client.setOutputGroup(
          currentToken(),
          pluginId,
          coordinatorId,
          memberIds,
        )
        setOutputs((current) => [
          ...current.filter((candidate) => candidate.pluginId !== pluginId),
          topology,
        ])
        await reconcileWorker()
      })
    },
    [client, currentToken, reconcileWorker, run],
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

  const pinAlbum = useCallback(
    async (albumId: string) => {
      await run(async () => watchOffline(await store.pinAlbum(albumId)))
    },
    [run, store, watchOffline],
  )

  const unpinAlbum = useCallback(
    async (albumId: string) => {
      await run(async () => watchOffline(await store.unpinAlbum(albumId)))
    },
    [run, store, watchOffline],
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
      const command: RpcSessionCommand = { _tag: "transport.play", payload: {} }
      setSession(await runConfirmedHostCommand(target, command))
    })
  }, [ensureSession, run, runConfirmedHostCommand])

  const pause = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      const command: RpcSessionCommand = { _tag: "transport.pause", payload: {} }
      const paused = await runConfirmedHostCommand(session, command)
      setSession(paused)
      await reportPosition(paused)
    })
  }, [reportPosition, run, runConfirmedHostCommand, session])

  const stop = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      const command: RpcSessionCommand = { _tag: "transport.stop", payload: {} }
      setSession(await runConfirmedHostCommand(session, command))
    })
  }, [run, runConfirmedHostCommand, session])

  const clearQueue = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      const command: RpcSessionCommand = { _tag: "queue.clear", payload: {} }
      setSession(await runConfirmedHostCommand(session, command))
    })
  }, [run, runConfirmedHostCommand, session])

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
        // The addressed Stop directive owns renderer teardown. Clearing the source here
        // can beat its durable state update and reload the still-Playing snapshot.
      })
    },
    [client, currentToken, run, session],
  )

  const attachAudio = useCallback(
    (element: HTMLAudioElement | null) => {
      audioElement.current = element
      playbackHost().attachAudio(element)
    },
    [playbackHost],
  )

  // Playback failure stays visible while unrelated operations and reconnects recover.
  const runtimeError = retainedHostFailure ?? error ?? realtimeError
  const runtimeStatus =
    retainedHostFailure === undefined && realtimeError === undefined ? status : "error"
  const context = useMemo(
    () => ({
      status: runtimeStatus,
      ...(grant === undefined ? {} : { grant }),
      plugins,
      albums,
      outputs,
      query,
      tracks,
      sourceAlbums,
      sourceArtists,
      searchHasNoSources,
      sourceFailures,
      stations,
      stationsHaveNoSources,
      stationFailures,
      ...(session === undefined ? {} : { session }),
      remoteSessions,
      ...(local === undefined ? {} : { local }),
      ...(offline === undefined ? {} : { offline }),
      updateAvailable,
      applyUpdate,
      ...(audioUrl === undefined ? {} : { audioUrl }),
      ...(runtimeError === undefined ? {} : { error: runtimeError }),
      setQuery,
      search,
      loadStations,
      startStation,
      startStationFromTrack,
      trackSeedSources,
      enqueue,
      enqueueAlbum,
      enqueueAlbumOnSession,
      clearOutputQueue,
      discoverOutput,
      createOutputSession,
      setOutputGroup,
      setAlbumPlacement,
      pinAlbum,
      unpinAlbum,
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
      runtimeStatus,
      grant,
      plugins,
      albums,
      outputs,
      query,
      tracks,
      sourceAlbums,
      sourceArtists,
      searchHasNoSources,
      sourceFailures,
      stations,
      stationsHaveNoSources,
      stationFailures,
      session,
      remoteSessions,
      local,
      offline,
      updateAvailable,
      applyUpdate,
      audioUrl,
      runtimeError,
      search,
      loadStations,
      startStation,
      startStationFromTrack,
      trackSeedSources,
      enqueue,
      enqueueAlbum,
      enqueueAlbumOnSession,
      clearOutputQueue,
      discoverOutput,
      createOutputSession,
      setOutputGroup,
      setAlbumPlacement,
      pinAlbum,
      unpinAlbum,
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
          <ReferenceOutputs />
          <ReferenceLibrary />
          <ReferenceStations />
          <ReferencePlaylists key={grant?.account.id} />
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
