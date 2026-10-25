import {
  type RpcSession,
  type RpcSessionCommand,
  type RpcSessionDirective,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import type { WorkerClient } from "../worker/client"
import { SESSION_CHANGED_DURING_CONFIRMATION } from "../worker/contract"

export type HostCommandOutcome =
  | { readonly _tag: "Applied"; readonly session: RpcSession; readonly replayed: boolean }
  | { readonly _tag: "Cancelled"; readonly session: RpcSession }

export interface ConfirmedHostPorts {
  readonly store: Pick<
    WorkerClient,
    "session" | "previewSessionCommand" | "queueSessionCommand" | "touchOfflineTrack"
  >
  readonly loadStream: (trackId: string) => Promise<string>
  readonly selectedSession: () => RpcSession | undefined
  readonly deviceId: () => string | undefined
  readonly publishSession: (session: RpcSession) => void
  readonly publishAudioUrl: (url: string | undefined) => void
  readonly reportFailure: (cause: unknown) => void
  readonly requestSessionSync: () => void
  readonly newCommandId: () => string
}

export interface ConfirmedPlaybackHost {
  attachAudio(element: HTMLAudioElement | null): void
  execute(
    sessionId: string,
    command: RpcSessionCommand,
    commandId?: string,
  ): Promise<HostCommandOutcome>
  applyDirective(directive: RpcSessionDirective): Promise<HostCommandOutcome>
  renderSession(session: RpcSession | undefined): void
  loadedTrack(): string | undefined
  dispose(): void
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
const cancelled = () => new DOMException("audio load was cancelled", "AbortError")
const isCancelled = (cause: unknown) => cause instanceof DOMException && cause.name === "AbortError"
const renderKey = (session: RpcSession) =>
  `${session.id}:${session.currentTrackId ?? ""}:${session.transport}`

// This is the single owner of renderer effects and their relationship to durable truth.
// Network synchronization stays outside the ordered local confirmation lane.
export function createConfirmedPlaybackHost(ports: ConfirmedHostPorts): ConfirmedPlaybackHost {
  let audio: HTMLAudioElement | null = null
  let source: { trackId: string; url: string } | undefined
  let loading: { trackId: string; promise: Promise<void> } | undefined
  let sourceGeneration = 0
  let sourceAbort = new AbortController()
  let pendingSeek: number | undefined
  let lane: Promise<void> = Promise.resolve()
  let disposed = false
  let executing = false
  let activePlay: { sessionId: string; abort: AbortController } | undefined
  let pauseIntent = 0
  let failureVersion = 0
  let correcting = false
  let suspendedRenderingFor: string | undefined
  let lastRendered: string | undefined
  let automatic: { key: string; promise: Promise<void> } | undefined
  const directives = new Map<
    string,
    { fingerprint: string; promise: Promise<HostCommandOutcome> }
  >()

  function owns(id: string): boolean {
    const selected = ports.selectedSession()
    return !disposed && selected?.id === id && selected.hostDeviceId === ports.deviceId()
  }

  function requireHost(id: string): void {
    if (!owns(id)) throw cancelled()
  }

  function requireStoredHost(target: RpcSession): void {
    requireHost(target.id)
    if (target.hostDeviceId === ports.deviceId()) return
    stop(true)
    ports.publishSession(target)
    throw cancelled()
  }

  function release(url: string | undefined): void {
    if (url !== undefined && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url)
  }

  function interrupt(): void {
    sourceGeneration += 1
    sourceAbort.abort()
    sourceAbort = new AbortController()
    loading = undefined
    activePlay?.abort.abort()
    audio?.pause()
  }

  function stop(clear: boolean): void {
    interrupt()
    if (audio !== null) audio.currentTime = 0
    if (clear) {
      pendingSeek = undefined
      release(source?.url)
      source = undefined
      ports.publishAudioUrl(undefined)
    }
    lastRendered = undefined
  }

  function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      void promise.catch(() => undefined)
      return Promise.reject(cancelled())
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(cancelled())
      signal.addEventListener("abort", abort, { once: true })
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
    })
  }

  async function load(target: RpcSession, signal: AbortSignal): Promise<void> {
    const trackId = target.currentTrackId
    if (trackId === undefined) throw new Error("queue is empty")
    if (source?.trackId === trackId) return
    if (loading?.trackId === trackId) return wait(loading.promise, signal)
    sourceGeneration += 1
    const mine = sourceGeneration
    const promise = (async () => {
      const url = await ports.loadStream(trackId)
      if (mine !== sourceGeneration || !owns(target.id)) {
        release(url)
        throw cancelled()
      }
      release(source?.url)
      source = { trackId, url }
      pendingSeek = target.positionMs
      ports.publishAudioUrl(url)
      void ports.store.touchOfflineTrack(trackId).catch(() => undefined)
    })()
    loading = { trackId, promise }
    try {
      await wait(wait(promise, sourceAbort.signal), signal)
    } finally {
      if (loading?.promise === promise) loading = undefined
    }
  }

  async function element(target: RpcSession, signal: AbortSignal): Promise<HTMLAudioElement> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      requireHost(target.id)
      if (signal.aborted) throw cancelled()
      if (
        audio !== null &&
        source !== undefined &&
        source.trackId === target.currentTrackId &&
        audio.getAttribute("src") === source.url
      )
        return audio
      await wait(new Promise<void>((resolve) => setTimeout(resolve, 0)), signal)
    }
    throw new Error("audio element did not load the requested track")
  }

  async function restore(target: RpcSession, signal = sourceAbort.signal): Promise<void> {
    if (target.currentTrackId === undefined) {
      if (audio !== null) audio.volume = target.volume / 100
      stop(true)
      return
    }
    await load(target, signal)
    const loaded = await element(target, signal)
    requireHost(target.id)
    loaded.volume = target.volume / 100
    await confirmSeek(loaded, target.positionMs, signal)
    pendingSeek = undefined
    if (target.transport === RpcTransport.Playing)
      await wait(Promise.resolve(loaded.play()), signal)
    else loaded.pause()
    lastRendered = renderKey(target)
  }

  async function confirmSeek(
    loaded: HTMLAudioElement,
    positionMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    // Browser time setters may return before the decoder applies the seek. Publish only
    // after seeked (or a synchronous renderer) confirms the requested position.
    if (signal.aborted) throw cancelled()
    const sought = new Promise<void>((resolve, reject) => {
      const finish = () => {
        cleanup()
        if (Math.abs(loaded.currentTime * 1000 - positionMs) > 250)
          reject(new Error("renderer refused seek"))
        else resolve()
      }
      const failed = () => {
        cleanup()
        reject(new Error("renderer failed seek"))
      }
      const aborted = () => {
        cleanup()
        reject(cancelled())
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error("renderer seek timed out"))
      }, 5000)
      const cleanup = () => {
        clearTimeout(timer)
        loaded.removeEventListener("seeked", finish)
        loaded.removeEventListener("error", failed)
        signal.removeEventListener("abort", aborted)
      }
      loaded.addEventListener("seeked", finish, { once: true })
      loaded.addEventListener("error", failed, { once: true })
      signal.addEventListener("abort", aborted, { once: true })
      try {
        loaded.currentTime = positionMs / 1000
        if (!loaded.seeking) finish()
      } catch (cause) {
        cleanup()
        reject(cause)
      }
    })
    await wait(sought, signal)
    requireHost(ports.selectedSession()?.id ?? "")
  }

  async function confirm(
    target: RpcSession,
    command: RpcSessionCommand,
    signal: AbortSignal,
  ): Promise<void> {
    switch (command._tag) {
      case "transport.play": {
        await load(target, signal)
        const loaded = await element(target, signal)
        requireHost(target.id)
        loaded.volume = target.volume / 100
        const seek = pendingSeek
        pendingSeek = undefined
        if (seek !== undefined) loaded.currentTime = seek / 1000
        await wait(Promise.resolve(loaded.play()), signal)
        return
      }
      case "transport.seek": {
        if (source?.trackId !== target.currentTrackId) throw new Error("seek track is not loaded")
        const loaded = await element(target, signal)
        if (
          !Number.isFinite(loaded.duration) ||
          loaded.duration <= 0 ||
          command.payload.positionMs > loaded.duration * 1000
        )
          throw new Error("renderer has no bounded seek duration")
        await confirmSeek(loaded, command.payload.positionMs, signal)
        return
      }
      case "transport.pause":
        interrupt()
        return
      case "transport.stop":
      case "queue.clear":
      case "cursor.jump":
        stop(true)
        return
      case "queue.remove":
        if (target.cursor === command.payload.index) stop(true)
        return
      case "volume.set":
        if (audio !== null) audio.volume = command.payload.volume / 100
        return
      default:
        return
    }
  }

  async function correctTransport(
    current: RpcSession,
    correction: RpcSessionCommand,
  ): Promise<RpcSession> {
    const commandId = ports.newCommandId()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      requireStoredHost(current)
      if (current.transport !== RpcTransport.Playing) return current
      await confirm(current, correction, sourceAbort.signal)
      try {
        const corrected = await ports.store.queueSessionCommand(
          current,
          correction,
          commandId,
          current.revision,
        )
        requireStoredHost(corrected)
        return corrected
      } catch (cause) {
        if (message(cause) !== SESSION_CHANGED_DURING_CONFIRMATION || attempt === 2) throw cause
        current = (await ports.store.session(current.id)) ?? current
      }
    }
    throw new Error(SESSION_CHANGED_DURING_CONFIRMATION)
  }

  function renderSession(target: RpcSession | undefined): void {
    if (disposed) return
    if (target === undefined || !owns(target.id) || target.hostDeviceId !== ports.deviceId()) {
      if (source !== undefined || loading !== undefined || activePlay !== undefined) stop(true)
      return
    }
    if (executing || pauseIntent > 0) return
    if (audio !== null) audio.volume = target.volume / 100
    const key = renderKey(target)
    if (key === lastRendered || key === automatic?.key) return
    if (target.transport !== RpcTransport.Playing) {
      suspendedRenderingFor = undefined
      interrupt()
      if (target.transport === RpcTransport.Stopped) {
        if (target.currentTrackId === undefined) stop(true)
        else if (audio !== null) {
          audio.currentTime = 0
          pendingSeek = undefined
        }
      }
      lastRendered = key
      return
    }
    if (suspendedRenderingFor === target.id) {
      audio?.pause()
      return
    }
    if (source?.trackId !== target.currentTrackId) audio?.pause()
    const task = (async () => {
      await load(target, sourceAbort.signal)
      const signal = sourceAbort.signal
      const loaded = await element(target, signal)
      requireHost(target.id)
      if (executing || pauseIntent > 0 || renderKey(ports.selectedSession() ?? target) !== key)
        return
      const seek = pendingSeek
      pendingSeek = undefined
      if (seek !== undefined && seek > 0) loaded.currentTime = seek / 1000
      await wait(Promise.resolve(loaded.play()), signal)
      if (owns(target.id)) lastRendered = key
    })()
    automatic = { key, promise: task }
    void task
      .catch((cause: unknown) => {
        if (
          !isCancelled(cause) &&
          owns(target.id) &&
          renderKey(ports.selectedSession() ?? target) === key
        )
          reportRendererFailure(cause)
      })
      .finally(() => {
        if (automatic?.promise === task) automatic = undefined
      })
  }

  async function perform(
    id: string,
    command: RpcSessionCommand,
    commandId: string,
    expectedRevision?: number,
  ): Promise<HostCommandOutcome> {
    requireHost(id)
    executing = true
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const preview = await ports.store.previewSessionCommand(id, command, commandId)
        requireStoredHost(preview.session)
        if (
          !preview.replayed &&
          expectedRevision !== undefined &&
          preview.session.revision !== expectedRevision
        )
          throw new Error("stale session directive")
        if (preview.replayed) {
          const replay = await ports.store.queueSessionCommand(preview.session, command, commandId)
          requireStoredHost(replay)
          ports.publishSession(replay)
          return { _tag: "Applied", session: replay, replayed: true }
        }
        if (command._tag === "transport.play") suspendedRenderingFor = undefined
        const play =
          command._tag === "transport.play"
            ? { sessionId: id, abort: new AbortController() }
            : undefined
        if (play !== undefined) activePlay = play
        const version = failureVersion
        let persisted = false
        try {
          await confirm(preview.session, command, play?.abort.signal ?? sourceAbort.signal)
          requireHost(id)
          if (play?.abort.signal.aborted) throw cancelled()
          if (play !== undefined && failureVersion !== version)
            throw new Error("audio failed while Play was being confirmed")
          let committed = await ports.store.queueSessionCommand(
            preview.session,
            command,
            commandId,
            preview.session.revision,
          )
          persisted = true
          requireStoredHost(committed)
          const cancelledDuringCommit =
            play?.abort.signal.aborted === true && failureVersion === version && pauseIntent === 0
          const failedWithQueuedPause =
            play !== undefined && failureVersion !== version && pauseIntent > 0
          if (failedWithQueuedPause) suspendedRenderingFor = id
          if (
            play !== undefined &&
            ((failureVersion !== version && !failedWithQueuedPause) || cancelledDuringCommit)
          ) {
            // The submitted write cannot be withdrawn. If local cancellation wins while
            // it settles, restore prior transport before publishing its result. This is
            // a separate correction, not a receipt for the cancellation-only Pause.
            const correction: RpcSessionCommand =
              cancelledDuringCommit && preview.session.transport === RpcTransport.Stopped
                ? { _tag: "transport.stop", payload: {} }
                : { _tag: "transport.pause", payload: {} }
            suspendedRenderingFor = id
            committed = await correctTransport(committed, correction)
          }
          if (committed.transport !== RpcTransport.Playing && suspendedRenderingFor === id)
            suspendedRenderingFor = undefined
          if (
            command._tag === "transport.play" ||
            command._tag === "transport.pause" ||
            command._tag === "transport.stop" ||
            command._tag === "transport.seek"
          )
            lastRendered = renderKey(committed)
          ports.publishSession(committed)
          if (cancelledDuringCommit || failedWithQueuedPause)
            return { _tag: "Cancelled", session: committed }
          return { _tag: "Applied", session: committed, replayed: false }
        } catch (cause) {
          requireHost(id)
          const latest = (await ports.store.session(id)) ?? preview.session
          requireStoredHost(latest)
          if (!persisted && play?.abort.signal.aborted === true && failureVersion === version) {
            if (latest.transport === RpcTransport.Playing) suspendedRenderingFor = id
            ports.publishSession(latest)
            return { _tag: "Cancelled", session: latest }
          }
          const failure =
            isCancelled(cause) && failureVersion !== version
              ? new Error("audio failed while Play was being confirmed")
              : cause
          if (suspendedRenderingFor === id) {
            if (
              command._tag !== "transport.play" &&
              message(failure) === SESSION_CHANGED_DURING_CONFIRMATION &&
              attempt < 2
            )
              continue
            ports.publishSession(latest)
            throw failure
          }
          if (isCancelled(cause) && failureVersion === version)
            return { _tag: "Cancelled", session: latest }
          requireHost(id)
          try {
            await restore(latest)
          } catch (restoreCause) {
            throw new Error(
              `${message(failure)}; renderer rollback failed: ${message(restoreCause)}`,
            )
          }
          if (message(failure) === SESSION_CHANGED_DURING_CONFIRMATION && attempt < 2) continue
          throw failure
        } finally {
          if (activePlay === play) activePlay = undefined
        }
      }
      throw new Error(SESSION_CHANGED_DURING_CONFIRMATION)
    } finally {
      executing = false
      renderSession(ports.selectedSession())
    }
  }

  async function execute(
    id: string,
    command: RpcSessionCommand,
    commandId = ports.newCommandId(),
    expectedRevision?: number,
  ): Promise<HostCommandOutcome> {
    requireHost(id)
    let urgent = false
    if (command._tag === "transport.pause") {
      try {
        const preview = await ports.store.previewSessionCommand(id, command, commandId)
        requireHost(id)
        if (!preview.replayed) {
          pauseIntent += 1
          urgent = true
          interrupt()
        }
      } catch (cause) {
        requireHost(id)
        // Pause can cancel an uncommitted Play without inventing Playing or a receipt.
        // A failed or cancelled delivery remains eligible for a later redelivery.
        if (message(cause) !== "cannot pause unless playing" || activePlay?.sessionId !== id)
          throw cause
        const current = await ports.store.session(id)
        requireHost(id)
        if (current === undefined || current.transport === RpcTransport.Playing) throw cause
        interrupt()
        return { _tag: "Cancelled", session: current }
      }
    }
    const task = lane
      .catch(() => undefined)
      .then(() => perform(id, command, commandId, expectedRevision))
    lane = task.then(
      () => undefined,
      () => undefined,
    )
    try {
      return await task
    } catch (cause) {
      requireHost(id)
      throw cause
    } finally {
      if (urgent) {
        pauseIntent -= 1
        renderSession(ports.selectedSession())
      }
    }
  }

  function reportRendererFailure(cause: unknown): void {
    if (disposed) return
    failureVersion += 1
    const error = new Error(`Audio renderer failed: ${message(cause)}`)
    ports.reportFailure(error)
    if (activePlay !== undefined) {
      suspendedRenderingFor = activePlay.sessionId
      activePlay.abort.abort()
      return
    }
    if (correcting) return
    const selected = ports.selectedSession()
    if (selected === undefined || !owns(selected.id)) return
    correcting = true
    suspendedRenderingFor = selected.id
    audio?.pause()
    void (async () => {
      const current = await ports.store.session(selected.id)
      if (!owns(selected.id) || current?.transport !== RpcTransport.Playing) return
      await execute(current.id, { _tag: "transport.pause", payload: {} })
      if (owns(selected.id)) ports.requestSessionSync()
    })()
      .catch((reportCause: unknown) => {
        if (owns(selected.id))
          ports.reportFailure(
            new Error(`${error.message}; could not report Paused: ${message(reportCause)}`),
          )
      })
      .finally(() => {
        correcting = false
      })
  }

  return {
    execute,
    renderSession,
    loadedTrack: () => source?.trackId,
    async applyDirective(directive) {
      requireHost(directive.sessionId)
      const key = `${directive.sessionId}:${directive.directiveId}`
      const fingerprint = JSON.stringify(directive.command)
      const prior = directives.get(key)
      if (prior !== undefined) {
        if (prior.fingerprint !== fingerprint)
          return Promise.reject(
            new Error("directive ID already belongs to a different session command"),
          )
        return prior.promise
      }
      const task = execute(
        directive.sessionId,
        directive.command,
        directive.directiveId,
        directive.expectedRevision,
      )
      directives.set(key, { fingerprint, promise: task })
      void task
        .finally(() => {
          if (directives.get(key)?.promise === task) directives.delete(key)
        })
        .catch(() => undefined)
      return task
    },
    attachAudio(element) {
      if (audio !== null && audio !== element) {
        audio.onerror = null
        audio.pause()
      }
      audio = element
      if (element !== null) {
        const volume = ports.selectedSession()?.volume
        if (volume !== undefined) element.volume = volume / 100
        element.onerror = () => {
          if (
            audio !== element ||
            source?.url !== element.getAttribute("src") ||
            source?.trackId !== ports.selectedSession()?.currentTrackId
          )
            return
          reportRendererFailure(
            new Error(element.error?.message ?? "the media element could not decode or load audio"),
          )
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (audio !== null) audio.onerror = null
      interrupt()
      release(source?.url)
      source = undefined
      directives.clear()
    },
  }
}
