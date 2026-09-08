/// Tests for what a car, a lock screen and a notification shade are told.
///
/// jsdom implements neither `navigator.mediaSession` nor `MediaMetadata`, so the session
/// below is a stand-in and `MediaMetadata` is installed on the global for the duration. That
/// means these tests prove what this binding *writes*, and can prove nothing about what any
/// dashboard does with it. Whether a car shows the right record is a fact about a car.

import { cleanup, render, waitFor } from "@testing-library/react"
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
  const handlers = new Map<string, ((details?: MediaSessionActionDetails) => void) | null>()
  return {
    metadata: null as FakeMetadata | null,
    playbackState: "none" as string,
    positionState: undefined as MediaPositionState | undefined,
    setActionHandler(
      action: string,
      handler: ((details?: MediaSessionActionDetails) => void) | null,
    ) {
      handlers.set(action, handler)
    },
    /// Mirrors the real API's refusals, or these tests would prove nothing about the
    /// clamping and the rate: a stand-in that accepts anything cannot catch a call the
    /// browser would have thrown on.
    setPositionState(state: MediaPositionState) {
      if (state.playbackRate === 0) throw new TypeError("playbackRate must not be zero")
      if (
        state.duration !== undefined &&
        state.position !== undefined &&
        state.position > state.duration
      )
        throw new TypeError("position must not exceed duration")
      this.positionState = state
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

/// jsdom loads no images, so a stand-in stands in for the decoder. It reports the dimensions
/// asked of it, which is what lets these tests say what is declared about a cover without
/// claiming anything about a cover being drawn.
function withFakeImages(size: { width: number; height: number } | "broken") {
  const original = globalThis.Image
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = size === "broken" ? 0 : size.width
    naturalHeight = size === "broken" ? 0 : size.height
    set src(_value: string) {
      queueMicrotask(() => (size === "broken" ? this.onerror?.() : this.onload?.()))
    }
  }
  ;(globalThis as { Image?: unknown }).Image = FakeImage
  return () => {
    ;(globalThis as { Image?: unknown }).Image = original
  }
}

test("declares the cover at the size it actually is", async () => {
  const restore = withFakeImages({ width: 501, height: 496 })
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

  // A dashboard picks between images by size, so an invented size is a lie it acts on and
  // "any" is a truth it ignores. Measuring is neither.
  await waitFor(() => expect(session.metadata?.artwork[0]?.sizes).toBe("501x496"))
  restore()
})

test("says the words before it has the picture", () => {
  const restore = withFakeImages({ width: 501, height: 496 })
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

  // Measuring takes a moment and a title should not wait for it.
  expect(session.metadata?.title).toBe("Die Slow")
  expect(session.metadata?.artwork).toEqual([])
  restore()
})

test("offers no cover at all when the cover will not load", async () => {
  const restore = withFakeImages("broken")
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{
        title: "Die Slow",
        album: "GET COLOR",
        artist: "HEALTH",
        artworkUrl: "/artwork/missing.jpg",
      }}
      transport="playing"
      session={session as unknown as MediaSession}
    />,
  )

  // A reference that resolves to nothing is worse than an honest absence.
  await waitFor(() => expect(session.metadata?.title).toBe("Die Slow"))
  expect(session.metadata?.artwork).toEqual([])
  restore()
})

test("does not leave one record's cover on the next", async () => {
  const restore = withFakeImages({ width: 501, height: 496 })
  const session = fakeSession()
  const { rerender } = render(
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
  await waitFor(() => expect(session.metadata?.artwork).toHaveLength(1))
  restore()

  const restoreBroken = withFakeImages("broken")
  rerender(
    <Probe
      nowPlaying={{
        title: "Nothing",
        album: "No Cover",
        artist: "HEALTH",
        artworkUrl: "/artwork/missing.jpg",
      }}
      transport="playing"
      session={session as unknown as MediaSession}
    />,
  )

  // Showing the previous album's sleeve next to this album's name is a confident lie, which
  // is worse than showing no sleeve at all.
  await waitFor(() => expect(session.metadata?.title).toBe("Nothing"))
  expect(session.metadata?.artwork).toEqual([])
  restoreBroken()
})

test("hands over an absolute cover, because whatever renders it is out of process", async () => {
  const restore = withFakeImages({ width: 501, height: 496 })
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
  session.handlers.get("nexttrack")?.({ action: "nexttrack" })
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

test("gives a dashboard a progress bar to draw", () => {
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      positionMs={42_000}
      durationMs={251_000}
      session={session as unknown as MediaSession}
    />,
  )

  expect(session.positionState).toEqual({
    duration: 251,
    position: 42,
    // Never zero: a zero rate is rejected outright, and playbackState is what stops a clock.
    playbackRate: 1,
  })
})

test("keeps the playback rate at one even when paused", () => {
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="paused"
      positionMs={42_000}
      durationMs={251_000}
      session={session as unknown as MediaSession}
    />,
  )

  expect(session.positionState?.playbackRate).toBe(1)
  expect(session.playbackState).toBe("paused")
})

test("draws no bar rather than a wrong one when the length is unknown", () => {
  const session = fakeSession()
  render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      positionMs={42_000}
      session={session as unknown as MediaSession}
    />,
  )

  expect(session.positionState).toEqual({})
})

test("survives a position past the end instead of taking the shell down", () => {
  const session = fakeSession()
  // The length comes from the loaded file and the position from the session, so the two can
  // disagree by a rounding. The API throws on a position past the duration.
  expect(() =>
    render(
      <Probe
        nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
        transport="playing"
        positionMs={999_000}
        durationMs={251_000}
        session={session as unknown as MediaSession}
      />,
    ),
  ).not.toThrow()
  expect(session.positionState?.position).toBe(251)
})

test("a scrubber, a steering wheel and a watch all land in the same place", () => {
  const session = fakeSession()
  const onSeek = vi.fn()
  render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      positionMs={42_000}
      durationMs={251_000}
      handlers={{ onSeek }}
      session={session as unknown as MediaSession}
    />,
  )

  session.handlers.get("seekto")?.({ action: "seekto", seekTime: 90 })
  expect(onSeek).toHaveBeenLastCalledWith(90_000)

  // A dashboard that says how far it wants to jump is obeyed.
  session.handlers.get("seekforward")?.({ action: "seekforward", seekOffset: 30 })
  expect(onSeek).toHaveBeenLastCalledWith(72_000)

  // One that does not gets the platform's ten seconds.
  session.handlers.get("seekbackward")?.({ action: "seekbackward" })
  expect(onSeek).toHaveBeenLastCalledWith(32_000)
})

test("a seek backwards past the start lands at the start", () => {
  const session = fakeSession()
  const onSeek = vi.fn()
  render(
    <Probe
      nowPlaying={{ title: "Die Slow", album: "GET COLOR", artist: "HEALTH" }}
      transport="playing"
      positionMs={4_000}
      durationMs={251_000}
      handlers={{ onSeek }}
      session={session as unknown as MediaSession}
    />,
  )

  session.handlers.get("seekbackward")?.({ action: "seekbackward" })
  expect(onSeek).toHaveBeenLastCalledWith(0)
})
