import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ulid } from "ulid"
import type {
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcPlacement,
  RpcPlugin,
  RpcSearchTrack,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"
import { createReferenceClient, type ReferenceClient } from "./api.ts"
import { ReferenceConsole } from "./Console.tsx"
import { ReferenceLibrary } from "./Library.tsx"
import { ReferencePlugins } from "./Plugins.tsx"
import { type ConsoleCommand, ReferenceContext } from "./Reference.context.tsx"
import { ReferenceAudio } from "./ReferenceAudio.tsx"
import { ReferenceRemote } from "./Remote.tsx"
import { ReferenceSessions } from "./Sessions.tsx"

const CONSOLE_COMMANDS: Record<ConsoleCommand, RpcSessionCommand> = {
  play: { _tag: "transport.play", payload: {} },
  pause: { _tag: "transport.pause", payload: {} },
  stop: { _tag: "transport.stop", payload: {} },
}

interface ReferenceAppProps {
  readonly client?: ReferenceClient
  readonly children?: ReactNode
}

const liveClient = createReferenceClient()

export function ReferenceApp({ client = liveClient, children }: ReferenceAppProps) {
  const started = useRef(false)
  const audioElement = useRef<HTMLAudioElement | null>(null)
  const placementQueues = useRef(new Map<string, Promise<void>>())
  const placementSequences = useRef(new Map<string, number>())
  const albumsRef = useRef<readonly RpcLibraryAlbum[]>([])
  const confirmedAlbumsRef = useRef<readonly RpcLibraryAlbum[]>([])
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
  const [audioUrl, setAudioUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const sessionRef = useRef<RpcSession>()
  const appliedDirectives = useRef<string[]>([])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const nextGrant = await client.claimDevice("reference browser")
        const [nextPlugins, nextAlbums, sessions] = await Promise.all([
          client.listPlugins(nextGrant.bearerToken),
          client.listAlbums(nextGrant.bearerToken),
          // Whether this device already owns a session is a durable question. Its own
          // realtime socket does not exist yet, so it is not reachable at this moment.
          client.listSessions(nextGrant.bearerToken, true),
        ])
        setGrant(nextGrant)
        setPlugins(nextPlugins)
        albumsRef.current = nextAlbums
        confirmedAlbumsRef.current = nextAlbums
        setAlbums(nextAlbums)
        const hosted = sessions.find((candidate) => candidate.hostDeviceId === nextGrant.device.id)
        sessionRef.current = hosted
        setSession(hosted)
        setRemoteSessions(
          sessions.filter(
            (candidate) => candidate.hostDeviceId !== nextGrant.device.id && candidate.reachable,
          ),
        )
        setStatus("ready")
      } catch (cause) {
        setError(message(cause))
        setStatus("error")
      }
    })()
  }, [client])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // The realtime socket is also what makes this device reachable, so a console can drive
  // it. Without a live socket the core correctly reports this session as uncontrollable.
  useEffect(() => {
    if (grant === undefined) return
    const token = grant.bearerToken
    const deviceId = grant.device.id
    return client.connectRealtime(token, {
      onEvent: (event) => {
        const state = event.state
        if (state._tag === "session.state") {
          const updated = state.payload
          if (updated.hostDeviceId === deviceId) {
            setSession(updated)
            return
          }
          setRemoteSessions((current) => {
            const others = current.filter((candidate) => candidate.id !== updated.id)
            return updated.reachable ? [...others, updated] : others
          })
          return
        }
        if (state._tag === "library.album.state") {
          const updated = state.payload
          // A local write in flight is newer intent than anything the socket can carry,
          // and an older revision must never overwrite a newer one: the two channels have
          // no ordering with respect to each other.
          if (placementQueues.current.has(updated.id)) return
          setAlbums((current) => {
            const existing = current.find((album) => album.id === updated.id)
            if (existing !== undefined && existing.revision > updated.revision) return current
            const next =
              existing === undefined
                ? [...current, updated]
                : current.map((album) => (album.id === updated.id ? updated : album))
            albumsRef.current = next
            confirmedAlbumsRef.current = next
            return next
          })
          return
        }
        const removedId = state.payload.id
        setAlbums((current) => {
          const next = current.filter((album) => album.id !== removedId)
          albumsRef.current = next
          confirmedAlbumsRef.current = next
          return next
        })
      },
      onResync: () => {
        // The server said the replay was incomplete. Refetch rather than patch.
        void (async () => {
          try {
            const [freshAlbums, freshSessions] = await Promise.all([
              client.listAlbums(token),
              client.listSessions(token, true),
            ])
            albumsRef.current = freshAlbums
            confirmedAlbumsRef.current = freshAlbums
            setAlbums(freshAlbums)
            setSession(freshSessions.find((candidate) => candidate.hostDeviceId === deviceId))
            setRemoteSessions(
              freshSessions.filter(
                (candidate) => candidate.hostDeviceId !== deviceId && candidate.reachable,
              ),
            )
          } catch (cause) {
            setError(message(cause))
          }
        })()
      },
      onDirective: (directive) => {
        // A reconnect can redeliver a directive. Applying `queue.add` twice would add the
        // same track twice, so identity decides, not arrival.
        if (appliedDirectives.current.includes(directive.directiveId)) return
        appliedDirectives.current = [
          ...appliedDirectives.current.slice(-511),
          directive.directiveId,
        ]
        void (async () => {
          try {
            if (directive.command._tag === "transport.play") {
              const current = sessionRef.current
              if (current?.currentTrackId !== undefined) {
                setAudioUrl(await client.loadStream(token, current.currentTrackId))
              }
            }
            setSession(await client.command(token, directive.sessionId, directive.command))
          } catch (cause) {
            setError(message(cause))
          }
        })()
      },
    })
  }, [client, grant])

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
    if (session !== undefined) return session
    const created = await client.createSession(currentToken(), "Reference browser")
    setSession(created)
    return created
  }, [client, currentToken, session])

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
          await client.command(currentToken(), target.id, {
            _tag: "queue.add",
            payload: { trackIds: [trackId] },
          }),
        )
      })
    },
    [client, currentToken, ensureSession, run],
  )

  const setAlbumPlacement = useCallback(
    async (albumId: string, placement: RpcPlacement) => {
      const sequence = (placementSequences.current.get(albumId) ?? 0) + 1
      placementSequences.current.set(albumId, sequence)
      const optimistic = albumsRef.current.map((album) =>
        album.id === albumId ? { ...album, placement } : album,
      )
      albumsRef.current = optimistic
      setAlbums(optimistic)

      await run(async () => {
        const previous = placementQueues.current.get(albumId) ?? Promise.resolve()
        const request = previous
          .catch(() => undefined)
          .then(() => client.setAlbumPlacement(currentToken(), albumId, placement))
        const queued = request.then(
          () => undefined,
          () => undefined,
        )
        placementQueues.current.set(albumId, queued)
        try {
          const updated = await request
          confirmedAlbumsRef.current = confirmedAlbumsRef.current.map((album) =>
            album.id === albumId && updated.revision >= album.revision ? updated : album,
          )
          if (placementSequences.current.get(albumId) === sequence) {
            albumsRef.current = confirmedAlbumsRef.current
            setAlbums(confirmedAlbumsRef.current)
          }
        } catch (cause) {
          if (placementSequences.current.get(albumId) === sequence) {
            try {
              const refreshed = await client.listAlbums(currentToken())
              confirmedAlbumsRef.current = mergeConfirmedAlbums(
                confirmedAlbumsRef.current,
                refreshed,
              )
              if (placementSequences.current.get(albumId) === sequence) {
                albumsRef.current = confirmedAlbumsRef.current
                setAlbums(confirmedAlbumsRef.current)
              }
            } catch {
              if (placementSequences.current.get(albumId) === sequence) {
                albumsRef.current = confirmedAlbumsRef.current
                setAlbums(confirmedAlbumsRef.current)
              }
            }
          }
          throw cause
        } finally {
          if (placementQueues.current.get(albumId) === queued) {
            placementQueues.current.delete(albumId)
          }
        }
      })
    },
    [client, currentToken, run],
  )

  const play = useCallback(async () => {
    await run(async () => {
      const target = await ensureSession()
      if (target.currentTrackId === undefined) throw new Error("queue is empty")
      const nextAudioUrl = await client.loadStream(currentToken(), target.currentTrackId)
      setAudioUrl(nextAudioUrl)
      setSession(
        await client.command(currentToken(), target.id, {
          _tag: "transport.play",
          payload: {},
        }),
      )
    })
  }, [client, currentToken, ensureSession, run])

  const pause = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      setSession(
        await client.command(currentToken(), session.id, {
          _tag: "transport.pause",
          payload: {},
        }),
      )
    })
  }, [client, currentToken, run, session])

  const stop = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      setSession(
        await client.command(currentToken(), session.id, {
          _tag: "transport.stop",
          payload: {},
        }),
      )
      setAudioUrl(undefined)
    })
  }, [client, currentToken, run, session])

  const clearQueue = useCallback(async () => {
    if (session === undefined) return
    await run(async () => {
      setSession(
        await client.command(currentToken(), session.id, {
          _tag: "queue.clear",
          payload: {},
        }),
      )
      setAudioUrl(undefined)
    })
  }, [client, currentToken, run, session])

  const reportEnded = useCallback(async () => {
    if (session === undefined || grant === undefined || session.currentTrackId === undefined) return
    const track = tracks.find((candidate) => candidate.id === session.currentTrackId)
    const playedMs = Math.min(Math.round((audioElement.current?.duration ?? 0) * 1000), 0xffffffff)
    await client.appendListen(currentToken(), {
      id: ulid(),
      trackId: session.currentTrackId,
      deviceId: grant.device.id,
      ...(track?.sourcePluginId === undefined ? {} : { sourcePluginId: track.sourcePluginId }),
      listenedAt: new Date().toISOString(),
      ...(playedMs === 0 ? {} : { playedMs }),
      completed: true,
      context: "queue",
      contextId: session.id,
    })
    const updated = await client.command(currentToken(), session.id, {
      _tag: "transport.trackEnded",
      payload: {},
    })
    setSession(updated)
  }, [client, currentToken, grant, session, tracks])

  const driveRemote = useCallback(
    async (sessionId: string, command: ConsoleCommand) => {
      await run(async () => {
        await client.sendCommand(currentToken(), sessionId, CONSOLE_COMMANDS[command])
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
      ...(audioUrl === undefined ? {} : { audioUrl }),
      ...(error === undefined ? {} : { error }),
      setQuery,
      search,
      enqueue,
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
      audioUrl,
      error,
      search,
      enqueue,
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
          <ReferencePlugins />
          <ReferenceLibrary />
          <ReferenceSessions />
          <ReferenceRemote />
          <ReferenceConsole />
          <ReferenceAudio />
        </main>
      )}
    </ReferenceContext.Provider>
  )
}

function mergeConfirmedAlbums(
  current: readonly RpcLibraryAlbum[],
  incoming: readonly RpcLibraryAlbum[],
): readonly RpcLibraryAlbum[] {
  const currentById = new Map(current.map((album) => [album.id, album]))
  return incoming.map((album) => {
    const existing = currentById.get(album.id)
    return existing !== undefined && existing.revision > album.revision ? existing : album
  })
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown error"
}
