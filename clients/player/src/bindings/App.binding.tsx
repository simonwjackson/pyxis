/// The shell: the one state reader for the whole client.
///
/// Route, credential, library and playback are read here and nowhere else, and everything
/// below receives plain values. They live in one binding on purpose. The two surfaces show
/// the same library, so a binding per screen would tear the library down and re-read it on
/// every navigation — the person would watch their albums disappear and come back for the
/// crime of pressing a tab. One reader, every surface.
///
/// The order here is load-bearing. The credential is read first because every call to the
/// core carries it, and the library is told to wait until one is held. Asking earlier does
/// not fail politely: the worker's sync reads the bearer token from its own settings row,
/// finds none, and reports `authRequired` — so the screen would tell a person their device
/// needs pairing on a perfectly ordinary first boot, about a problem this client created by
/// asking too early.

import { useCallback, useMemo, useState } from "react"
import type { AlbumView } from "../model/album"
import { type EdgeReason, type Remote, shownValue } from "../model/edge"
import { byRecentlyAdded, downloaded, inPlacement } from "../model/library"
import { ROUTES, routeTitle, sameRoute } from "../router/route.ts"
import { AccountSheet } from "../shapes/AccountSheet.tsx"
import type { AlbumSummary } from "../shapes/album.ts"
import type { AccountStanding } from "../shapes/entities.ts"
import { LibraryPage } from "../shapes/LibraryPage.tsx"
import { NowBarPlaying } from "../shapes/NowBarPlaying.tsx"
import { NowBarResting } from "../shapes/NowBarResting.tsx"
import { type StacksContent, StacksPage, type StacksShelf } from "../shapes/StacksPage.tsx"
import type { SurfaceState } from "../shapes/surface.ts"
import { UpdateNotice } from "../shapes/UpdateNotice.tsx"
import { Action } from "../system-next/Action.tsx"
import { AppFrame } from "../system-next/AppFrame.tsx"
import { ChoiceChip } from "../system-next/ChoiceChip.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { Notice } from "../system-next/Notice.tsx"
import { AudioRenderer } from "./AudioRenderer.binding.tsx"
import { type AccountEdge, useAccount } from "./useAccount.binding.tsx"
import { type FullscreenDocument, useFullscreen } from "./useFullscreen.binding.tsx"
import { type LibraryEdge, useLibrary } from "./useLibrary.binding.tsx"
import { useMediaSession } from "./useMediaSession.binding.tsx"
import { type PlaybackEdge, usePlayback } from "./usePlayback.binding.tsx"
import { type RealtimeEdge, useRealtime } from "./useRealtime.binding.tsx"
import { useRoute } from "./useRoute.binding.tsx"
import { type UpdateEdge, useUpdate } from "./useUpdate.binding.tsx"

/// Narrow an edge album to what a cover needs. The surfaces never see the richer view, so
/// they cannot start depending on fields the edge might stop sending.
const summarise = (album: AlbumView): AlbumSummary => ({
  id: album.id,
  title: album.title,
  artist: album.artist,
  availability: album.availability,
  ...(album.artworkUrl === undefined ? {} : { artworkUrl: album.artworkUrl }),
  ...(album.year === undefined ? {} : { year: album.year }),
})

/// Turn a reason into something worth reading. Each one implies a different next move, so
/// none of them collapses into "something went wrong".
const reasonText = (reason: EdgeReason): string => {
  if (reason.kind === "offline") return "This device is offline. Showing what it already has."
  if (reason.kind === "auth-required")
    return "This device needs to be paired again before it can reconcile."
  // The core said this cannot succeed, so the sentence must not imply waiting will help.
  // Inviting a retry that is guaranteed to fail spends someone's attention teaching them so.
  if (reason.kind === "permanent") return `Your library refused this request: ${reason.message}`
  return `Could not reach your library: ${reason.message}`
}

/// The single translation from edge vocabulary to surface vocabulary.
///
/// The awkward case is the last one: a failure that still has data. Blanking the screen
/// there would be the easy branch and the wrong one, so the data is shown and the reason is
/// carried alongside it.
function toSurface<T>(
  remote: Remote<readonly AlbumView[]>,
  build: (albums: readonly AlbumView[]) => T,
): SurfaceState<T> {
  if (remote.state === "unknown" || remote.state === "loading") return { state: "pending" }
  if (remote.state === "ready")
    return remote.value.length === 0
      ? { state: "empty" }
      : { state: "shown", value: build(remote.value), freshness: remote.freshness }
  const reason = reasonText(remote.reason)
  // Nothing kept from before: this is the only case with genuinely nothing to draw.
  if (remote.last === undefined) return { state: "blocked", reason }
  // Kept an answer, and the answer was nothing. Both facts are true and both are said.
  if (remote.last.length === 0) return { state: "empty", reason }
  return { state: "shown", value: build(remote.last), freshness: "stale", reason }
}

function buildStacks(albums: readonly AlbumView[]): StacksContent {
  const recent = byRecentlyAdded(albums)
  const lead = recent[0]
  const shelves: readonly StacksShelf[] = [
    { id: "recent", title: "Recently added", albums: recent.slice(1).map(summarise) },
    {
      id: "collection",
      title: "In your collection",
      albums: inPlacement(albums, "collection").map(summarise),
    },
    {
      id: "discovery",
      title: "Waiting in discovery",
      albums: inPlacement(albums, "discovery").map(summarise),
    },
    { id: "downloaded", title: "On this device", albums: downloaded(albums).map(summarise) },
  ]
  // The lead is the most recently added album, because that is the only "what should I put
  // on" signal this client can honestly compute today. Play counts and neglect would make
  // better shelves, and the core records the history for them, but nothing reads it yet —
  // so those shelves are absent rather than faked.
  return {
    ...(lead === undefined ? {} : { lead: summarise(lead), leadContext: "Most recently added" }),
    shelves,
  }
}

export interface AppProps {
  /// Injected by the composition root so this binding is testable without a browser
  /// database, and so the client cannot quietly widen what it asks the worker for.
  readonly edge: LibraryEdge
  readonly accountEdge: AccountEdge
  readonly playbackEdge: PlaybackEdge
  /// How to open the realtime socket. Optional so a test that is not about presence does
  /// not have to fake one; absent means this device never becomes reachable, and the
  /// interface withholds transport controls, which is the honest reading of not connected.
  readonly realtimeEdge?: RealtimeEdge
  /// How to notice a newer build and how to move onto it. Optional for the same reason as
  /// the socket: a test about the library should not have to fake a deploy.
  readonly updateEdge?: UpdateEdge
  /// Where a car, a lock screen or a notification shade reads what is playing. Optional
  /// because it is a browser global, and absent in tests and in browsers without one.
  readonly mediaSession?: MediaSession
  /// Where full screen is asked for. A global, so it is bound at the root like the rest, and
  /// absent in tests and in browsers without a Fullscreen API.
  readonly fullscreenTarget?: FullscreenDocument
  /// What this device calls itself in the account. A real decision rather than a nickname:
  /// it is what a person reads when choosing where to send music, so the composition root
  /// derives it from the actual browser instead of this file inventing one.
  readonly deviceName: string
}

export function App({
  edge,
  accountEdge,
  playbackEdge,
  realtimeEdge,
  updateEdge,
  mediaSession,
  fullscreenTarget,
  deviceName,
}: AppProps) {
  const { route, go } = useRoute()
  const update = useUpdate(updateEdge)
  const fullscreen = useFullscreen(fullscreenTarget)
  /// Whether the account sheet is showing. Ephemeral interaction state that is born here and
  /// dies here, which is why it may live below the shell's other readers rather than in one.
  const [accountOpen, setAccountOpen] = useState(false)
  const { credential, reclaim } = useAccount(accountEdge, deviceName)
  const held = credential.state === "ready" ? credential.value : undefined

  const library = useLibrary(edge, { ready: held !== undefined })
  const { albums, refresh } = library
  const playback = usePlayback(playbackEdge, held === undefined ? {} : { deviceId: held.device.id })

  // Holding this socket is what makes the core count this device as present, and presence
  // is what makes its own sessions controllable. Without it the transport controls are
  // correctly withheld: the core is not wrong to call an unconnected device unreachable.
  const { applySession, applyDirective, refresh: refreshPlayback } = playback
  useRealtime(realtimeEdge, held?.token, {
    onSession: applySession,
    onDirective: applyDirective,
    // The replay had a gap, so what is held is no longer trustworthy. Re-read rather than
    // carry on from a state that quietly missed something.
    onResyncRequired: refreshPlayback,
  })
  const { playAlbum, play, pause, next, previous, seek } = playback

  const stacks = useMemo(() => toSurface(albums, buildStacks), [albums])
  const everything = useMemo(() => toSurface(albums, (found) => found.map(summarise)), [albums])
  const total = albums.state === "ready" ? albums.value.length : undefined
  const onRetry = useCallback(() => refresh(), [refresh])

  /// Choosing an album plays it.
  ///
  /// The track ids come from the album the edge already handed us, because the core queues
  /// by track id: an album that knows only how many tracks it has cannot be played. The
  /// same list the surfaces are drawing is used, so a cover that is visible during an
  /// outage is still a cover that works.
  const onOpenAlbum = useCallback(
    (albumId: string) => {
      const album = shownValue(albums)?.find((candidate) => candidate.id === albumId)
      if (album === undefined) return
      // Whether an empty track list is playable is `playAlbum`'s decision, not this one. A
      // second check here read as defensive and was dead: removing it changed no behaviour
      // and no test, which is what a duplicated decision always looks like.
      playAlbum(album.tracks.map((track) => track.id))
    },
    [albums, playAlbum],
  )

  /// What the bar is about. Resolved by finding the album that owns the sounding track,
  /// rather than by remembering what was pressed: after a reload, or a command from another
  /// device, the session is the only thing that knows.
  /// What the account sheet says about this device. Derived from the credential rather than
  /// stored, so it cannot drift from the thing it describes.
  const standing: AccountStanding =
    held === undefined
      ? {
          state: "unpaired",
          deviceName,
          trouble:
            credential.state === "unavailable"
              ? reasonText(credential.reason)
              : "This device has not asked for a credential yet.",
          // Asking again is only worth offering when repeating it could change the answer.
          canRetry: credential.state !== "unavailable" || credential.reason.kind !== "permanent",
        }
      : { state: "paired", accountName: held.account.name, deviceName: held.device.name }

  const sounding = playback.playback.state === "ready" ? playback.playback.value : undefined

  const soundingTrackId = sounding?.currentTrackId
  const soundingAlbum = useMemo(
    () =>
      soundingTrackId === undefined
        ? undefined
        : shownValue(albums)?.find((candidate) =>
            candidate.tracks.some((track) => track.id === soundingTrackId),
          ),
    [albums, soundingTrackId],
  )

  /// What a car, a lock screen or a notification shade is told.
  ///
  /// The track's own name rather than the album's: a dashboard showing the record while the
  /// fourth song plays is telling a half-truth, and the album is carried alongside anyway.
  const soundingTrack = soundingAlbum?.tracks.find((track) => track.id === soundingTrackId)
  useMediaSession({
    ...(soundingAlbum === undefined || soundingTrack === undefined
      ? {}
      : {
          nowPlaying: {
            title: soundingTrack.title,
            album: soundingAlbum.title,
            artist: soundingTrack.artist ?? soundingAlbum.artist,
            ...(soundingAlbum.artworkUrl === undefined
              ? {}
              : { artworkUrl: soundingAlbum.artworkUrl }),
          },
        }),
    ...(sounding === undefined
      ? {}
      : { transport: sounding.transport === "playing" ? "playing" : "paused" }),
    // Both or neither: a dashboard cannot draw a progress bar against an unknown length.
    ...(sounding?.durationMs === undefined
      ? {}
      : { positionMs: sounding.positionMs, durationMs: sounding.durationMs }),
    handlers: {
      onPlay: play,
      onPause: pause,
      onStop: pause,
      onSeek: seek,
      // Offered to the dashboard only where there is somewhere to go, for the same reason
      // the bar omits them: a skip that cannot work should not be presented as one.
      ...(sounding?.hasNext ? { onNext: next } : {}),
      ...(sounding?.hasPrevious ? { onPrevious: previous } : {}),
    },
    session: mediaSession,
  })

  // Every hook has run by here, so the early return below cannot change their order.
  //
  // The core refused this device, and waiting will not change that answer. Saying so once
  // and offering the only thing that helps is better than rendering an empty library with a
  // quiet caption, which invites someone to conclude their music is gone.
  if (credential.state === "unavailable" && credential.reason.kind === "auth-required") {
    return (
      <Notice
        message="This device is not paired yet, so it cannot read your library."
        tone="failure"
        actions={<Action label="Pair this device" emphasis="primary" onClick={reclaim} />}
      />
    )
  }

  return (
    <AppFrame
      nav={
        <Flow direction="row" gap="small">
          {ROUTES.map((candidate) => (
            <ChoiceChip
              key={candidate.name}
              label={routeTitle(candidate)}
              selected={sameRoute(candidate, route)}
              {...(candidate.name === "library" && total !== undefined ? { count: total } : {})}
              onClick={() => go(candidate)}
            />
          ))}
        </Flow>
      }
      // Above the surface and outside the outlet, so it neither scrolls away nor disappears
      // on navigation. Reloading stays the person's choice: a page that reloads itself can
      // end a track halfway through for the sake of a version number.
      notice={update.available ? <UpdateNotice onApply={update.apply} /> : undefined}
      // Configuration hangs off the account control rather than taking a navigation slot,
      // which is the approved arrangement. It is also the only place that answers "which
      // build am I on" without putting a version number permanently on screen.
      account={
        <>
          <Action label="Account" onClick={() => setAccountOpen(true)} />
          <AccountSheet
            standing={standing}
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            updateAvailable={update.available}
            fullscreen={fullscreen.active}
            {...(fullscreen.supported ? { onToggleFullscreen: fullscreen.toggle } : {})}
            {...(update.build === undefined ? {} : { build: update.build })}
            {...(credential.state === "unavailable" ? { onPair: reclaim } : {})}
          />
        </>
      }
      // Outside the outlet. Navigating replaces the surface above and leaves this alone,
      // which is the entire reason the router exists rather than a conditional render.
      bar={
        soundingAlbum === undefined || sounding === undefined ? (
          <NowBarResting />
        ) : (
          <NowBarPlaying
            album={summarise(soundingAlbum)}
            room={sounding.name}
            transport={sounding.transport === "playing" ? "playing" : "paused"}
            // Offered only when a command sent now could actually take effect. A control
            // that silently does nothing is worse than one that is not there. Skipping is
            // additionally gated on there being somewhere to go, so the first and last
            // tracks of a queue simply have one fewer control.
            {...(sounding.controllable
              ? { onToggle: sounding.transport === "playing" ? pause : play }
              : {})}
            {...(sounding.controllable && sounding.hasPrevious ? { onPrevious: previous } : {})}
            {...(sounding.controllable && sounding.hasNext ? { onNext: next } : {})}
          />
        )
      }
    >
      {route.name === "stacks" ? (
        <StacksPage library={stacks} onRetry={onRetry} onOpenAlbum={onOpenAlbum} />
      ) : (
        <LibraryPage library={everything} onRetry={onRetry} onOpenAlbum={onOpenAlbum} />
      )}
      {/* Draws nothing. It holds the only real playback truth in the client and sits inside
          the frame rather than the outlet, so navigating cannot stop the music. */}
      <AudioRenderer playback={playback} />
    </AppFrame>
  )
}
