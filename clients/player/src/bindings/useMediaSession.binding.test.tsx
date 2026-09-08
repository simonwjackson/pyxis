/// Tests for what a car, a lock screen and a notification shade are told.
///
/// jsdom implements neither `navigator.mediaSession` nor `MediaMetadata`, so the session
/// below is a stand-in and `MediaMetadata` is installed on the global for the duration. That
/// means these tests prove what this binding *writes*, and can prove nothing about what any
/// dashboard does with it. Whether a car shows the right record is a fact about a car.

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useMediaSession } from "./useMediaSession.binding.tsx"

afterEach(cleanup)

class FakeMetadata {
  title: string
  album: string
  artist: string
  artwork: readonly { src: string; sizes?: string }[]
  constructor(init: {
    title?: string
    album?: string
    artist?: string
    artwork?: readonly { src: string; sizes?: string }[]
  }) {
    this.title = init.title ?? ""
    this.album = init.album ?? ""
    this.artist = init.artist ?? ""
    this.artwork = init.artwork ?? []
  }
}

function fakeSession() {
  const handlers = new Map<string, (() => void) | null>()
  return {
    metadata: null as FakeMetadata | null,
    playbackState: "none" as string,
    setActionHandler(action: string, handler: (() => void) | null) {
      handlers.set(action, handler)
    },
    handlers,
  }
}

beforeEach(() => {
  ;(globalThis as { MediaMetadata?: unknown }).MediaMetadata = FakeMetadata
})

function Probe(props: Parameters<typeof useMediaSession>[0]) {
  useMediaSession(props)
  return null
}

test("names the track, not just the record", () => {
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{
        title: "Die Slow",
        album: "GET COLOR",
        artist: "HEALTH",
        artworkUrl: "/artwork/get-color.jpg",
      }}
      transport="playing"
      session={session as unknown as MediaSession}
    />,
  )

  // A dashboard showing the album while the fourth song plays is telling a half-truth.
  expect(session.metadata?.title).toBe("Die Slow")
  expect(session.metadata?.album).toBe("GET COLOR")
  expect(session.metadata?.artist).toBe("HEALTH")
  expect(session.playbackState).toBe("playing")
})

test("hands over an absolute cover, because whatever renders it is out of process", () => {
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{
        title: "Die Slow",
        album: "GET COLOR",
        artist: "HEALTH",
        artworkUrl: "/artwork/get-color.jpg",
      }}
      transport="playing"
      session={session as unknown as MediaSession}
    />,
  )

  for (const image of session.metadata?.artwork ?? []) expect(image.src).toMatch(/^https?:\/\//)
})

test("clears the dashboard when nothing is loaded", () => {
  const session = fakeSession()
  session.metadata = new FakeMetadata({ title: "stale" })
  render(<Probe session={session as unknown as MediaSession} />)

  // Leaving the last record up would keep claiming something is playing after it stopped.
  expect(session.metadata).toBeNull()
  expect(session.playbackState).toBe("none")
})

test("offers a skip only where there is somewhere to go", () => {
  const session = fakeSession()
  const onNext = vi.fn()
  const { rerender } = render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      handlers={{ onNext }}
      session={session as unknown as MediaSession}
    />,
  )
  session.handlers.get("nexttrack")?.()
  expect(onNext).toHaveBeenCalledTimes(1)

  rerender(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      handlers={{}}
      session={session as unknown as MediaSession}
    />,
  )

  // Cleared rather than left behind: a dashboard that keeps offering a skip at the end of a
  // queue is a button whose press does nothing.
  expect(session.handlers.get("nexttrack")).toBeNull()
})

test("releases its handlers when the shell goes away", () => {
  const session = fakeSession()
  const { unmount } = render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      handlers={{ onPlay: () => {} }}
      session={session as unknown as MediaSession}
    />,
  )

  unmount()

  expect(session.handlers.get("play")).toBeNull()
})
