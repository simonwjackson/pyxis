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
}

export interface MediaSessionOptions {
  /// Absent when nothing is loaded, which clears the session rather than leaving a stale
  /// record on a dashboard after the music has stopped.
  readonly nowPlaying?: NowPlayingMetadata
  readonly transport?: "playing" | "paused"
  readonly handlers?: MediaSessionHandlers
  /// Injected so this is testable without a browser, and so the one reach for the global
  /// stays in a single place.
  readonly session?: MediaSession | undefined
}

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
        artwork:
          artworkUrl === undefined
            ? []
            : ["96x96", "192x192", "512x512"].map((sizes) => ({
                src: absolute(artworkUrl, globalThis.location?.href ?? "/"),
                sizes,
              })),
      })
    }
    session.playbackState = transport === "playing" ? "playing" : "paused"
  }, [session, title, album, artist, artworkUrl, transport])

  useEffect(() => {
    if (session === undefined) return
    // A handler that is absent must be cleared rather than left behind, or a dashboard keeps
    // offering a skip at the end of a queue and the press does nothing.
    const bind = (action: MediaSessionAction, handler: (() => void) | undefined) => {
      try {
        session.setActionHandler(action, handler === undefined ? null : () => handler())
      } catch {
        // Not every browser supports every action, and an unsupported one is not a failure.
      }
    }
    bind("play", onPlay)
    bind("pause", onPause)
    bind("nexttrack", onNext)
    bind("previoustrack", onPrevious)
    return () => {
      bind("play", undefined)
      bind("pause", undefined)
      bind("nexttrack", undefined)
      bind("previoustrack", undefined)
    }
  }, [session, onPlay, onPause, onNext, onPrevious])
}
