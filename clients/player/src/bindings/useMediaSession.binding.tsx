/// What the car, the lock screen and the notification shade are told.
///
/// A binding because it writes to `navigator.mediaSession`, which is a global and therefore
/// off limits everywhere below one.
///
/// Two things depend on this being right. The obvious one is that the record's name and
/// cover appear where someone is actually looking -- a dashboard shows the page title
/// otherwise, which is the application's name and never the music's. The less obvious one is
/// that a page with a media session is a media application as far as the browser is
/// concerned. Without it a backgrounded page that finishes a track and asks to start the
/// next one is refused by autoplay policy, because nothing marks it as playing music on
/// purpose.

import { useEffect } from "react"

export interface NowPlayingMetadata {
  readonly title: string
  readonly album: string
  readonly artist: string
  readonly artworkUrl?: string
}

export interface MediaSessionHandlers {
  readonly onPlay?: () => void
  readonly onPause?: () => void
  readonly onNext?: () => void
  readonly onPrevious?: () => void
  readonly onStop?: () => void
  /// Absolute position, in milliseconds from the start of the track.
  readonly onSeek?: (positionMs: number) => void
}

export interface MediaSessionOptions {
  /// Absent when nothing is loaded, which clears the session rather than leaving a stale
  /// record on a dashboard after the music has stopped.
  readonly nowPlaying?: NowPlayingMetadata
  readonly transport?: "playing" | "paused"
  /// Where the track is and how long it runs. Both are needed or neither is sent: a
  /// dashboard cannot draw a progress bar against an unknown length, and the API rejects a
  /// position state without a duration.
  readonly positionMs?: number
  readonly durationMs?: number
  readonly handlers?: MediaSessionHandlers
  /// Injected so this is testable without a browser, and so the one reach for the global
  /// stays in a single place.
  readonly session?: MediaSession | undefined
}

/// How far a jump lands when a dashboard asks to seek without saying how far. Ten seconds is
/// the platform convention, and a dashboard that has its own idea sends one, which is
/// preferred over this.
const DEFAULT_SEEK_OFFSET_SECONDS = 10

/// Resolve against the document so a dashboard fetching the cover gets an absolute URL. A
/// relative path is meaningless to whatever is rendering it out of process.
function absolute(url: string, base: string): string {
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

export function useMediaSession(options: MediaSessionOptions): void {
  const { nowPlaying, transport, handlers, session } = options
  const title = nowPlaying?.title
  const album = nowPlaying?.album
  const artist = nowPlaying?.artist
  const artworkUrl = nowPlaying?.artworkUrl
  const onPlay = handlers?.onPlay
  const onPause = handlers?.onPause
  const onNext = handlers?.onNext
  const onPrevious = handlers?.onPrevious
  const onStop = handlers?.onStop
  const onSeek = handlers?.onSeek
  const { positionMs, durationMs } = options

  useEffect(() => {
    if (session === undefined) return
    if (title === undefined || album === undefined || artist === undefined) {
      // Nothing is loaded. Leaving the last record on the dashboard would keep claiming
      // something is playing after it has stopped.
      session.metadata = null
      session.playbackState = "none"
      return
    }
    const Metadata = globalThis.MediaMetadata
    if (Metadata !== undefined) {
      session.metadata = new Metadata({
        title,
        album,
        artist,
        // Several sizes are declared from one file on purpose: the cover is already square
        // and a dashboard picks whichever it wants rather than being handed one guess.
        // One entry at "any" rather than the same file declared at three invented sizes.
        // The cover's real dimensions are not known here, and claiming to offer a 96px and
        // a 512px version of one image is a lie a dashboard is entitled to believe.
        artwork:
          artworkUrl === undefined
            ? []
            : [{ src: absolute(artworkUrl, globalThis.location?.href ?? "/"), sizes: "any" }],
      })
    }
    session.playbackState = transport === "playing" ? "playing" : "paused"
  }, [session, title, album, artist, artworkUrl, transport])

  useEffect(() => {
    if (session === undefined) return
    // A handler that is absent must be cleared rather than left behind, or a dashboard keeps
    // offering a skip at the end of a queue and the press does nothing.
    const bind = (
      action: MediaSessionAction,
      handler: ((details: MediaSessionActionDetails) => void) | undefined,
    ) => {
      try {
        session.setActionHandler(action, handler === undefined ? null : handler)
      } catch {
        // Not every browser supports every action, and an unsupported one is not a failure.
      }
    }
    bind("play", onPlay)
    bind("pause", onPause)
    bind("stop", onStop)
    bind("nexttrack", onNext)
    bind("previoustrack", onPrevious)

    // Seeking is three actions sharing one destination. A dashboard sends whichever its
    // hardware offers -- a scrubber sends `seekto`, a steering wheel sends an offset -- and
    // all three end at the same absolute position, because the alternative is a player that
    // scrubs in a car and not on a watch.
    const seekTo = (details?: MediaSessionActionDetails) => {
      if (onSeek === undefined) return
      const to = details?.seekTime
      if (to === undefined) return
      onSeek(Math.round(to * 1000))
    }
    const seekBy = (direction: 1 | -1, details?: MediaSessionActionDetails) => {
      if (onSeek === undefined || positionMs === undefined) return
      const offset = details?.seekOffset ?? DEFAULT_SEEK_OFFSET_SECONDS
      onSeek(Math.max(0, positionMs + direction * offset * 1000))
    }
    bind("seekto", onSeek === undefined ? undefined : seekTo)
    bind("seekforward", onSeek === undefined ? undefined : (details) => seekBy(1, details))
    bind("seekbackward", onSeek === undefined ? undefined : (details) => seekBy(-1, details))

    return () => {
      for (const action of [
        "play",
        "pause",
        "stop",
        "nexttrack",
        "previoustrack",
        "seekto",
        "seekforward",
        "seekbackward",
      ] as const)
        bind(action, undefined)
    }
  }, [session, onPlay, onPause, onStop, onNext, onPrevious, onSeek, positionMs])

  /// Where the track is, so a dashboard can draw a real progress bar.
  ///
  /// This is set at changes rather than on a timer on purpose: the browser advances the
  /// position itself from the playback rate, so a dashboard's clock keeps running between
  /// updates. Polling would burn wakeups on a locked phone to tell it something it can
  /// already work out.
  useEffect(() => {
    if (session === undefined || session.setPositionState === undefined) return
    if (durationMs === undefined || durationMs <= 0) {
      // A length is not yet known -- the track has not loaded far enough to say. Clearing is
      // right: a dashboard drawing a bar against a stale duration shows a wrong remaining
      // time, which is worse than showing none.
      try {
        session.setPositionState({})
      } catch {
        // Ignored for the same reason as below.
      }
      return
    }
    try {
      session.setPositionState({
        duration: durationMs / 1000,
        // Clamped because the API throws on a position past the duration, and the two
        // arrive from different places: the length from the loaded file, the position from
        // the session. A rounding disagreement between them must not take down the shell.
        position: Math.min(Math.max(positionMs ?? 0, 0), durationMs) / 1000,
        // Always one, never zero. A zero rate is rejected outright by the API, and it is
        // not how a pause is expressed: `playbackState` above is what stops a dashboard's
        // clock, and this says how fast time moves while it is running.
        playbackRate: 1,
      })
    } catch {
      // Some browsers reject combinations others accept, and a dashboard without a progress
      // bar is a smaller loss than a player that crashes trying to draw one.
    }
  }, [session, positionMs, durationMs])
}
