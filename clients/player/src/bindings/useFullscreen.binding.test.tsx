/// Tests for asking to have the whole screen.
///
/// jsdom implements no Fullscreen API, so the document below is a stand-in. These prove what
/// is asked for and what the control then says; whether a phone actually hides its system
/// bars is a fact about a phone.

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { type FullscreenDocument, useFullscreen } from "./useFullscreen.binding.tsx"

afterEach(cleanup)

function fakeDocument(options: { supported?: boolean } = {}) {
  const listeners = new Set<() => void>()
  const target = {
    fullscreenElement: null as unknown,
    documentElement: {
      ...(options.supported === false ? {} : { requestFullscreen: vi.fn(async () => undefined) }),
    },
    exitFullscreen: vi.fn(async () => undefined),
    addEventListener: (_type: "fullscreenchange", listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: "fullscreenchange", listener: () => void) => {
      listeners.delete(listener)
    },
    /// Stands in for the browser changing the state, by any route: the control asking, a
    /// system back gesture, or Escape.
    enter(element: unknown = {}) {
      target.fullscreenElement = element
      for (const listener of listeners) listener()
    },
    leave() {
      target.fullscreenElement = null
      for (const listener of listeners) listener()
    },
  }
  return target
}

let seen: ReturnType<typeof useFullscreen>
function Probe({ target }: { target?: FullscreenDocument }) {
  seen = useFullscreen(target)
  return null
}

test("asks for the system bars to go, not merely for a big window", () => {
  const target = fakeDocument()
  render(<Probe target={target as unknown as FullscreenDocument} />)

  seen.toggle()

  // Without navigationUI the browser may keep its own bars, which is the difference between
  // full screen and a maximised page.
  expect(target.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" })
})

test("hands the screen back when asked again", () => {
  const target = fakeDocument()
  render(<Probe target={target as unknown as FullscreenDocument} />)
  act(() => target.enter())

  seen.toggle()

  expect(target.exitFullscreen).toHaveBeenCalled()
})

test("notices the screen being given back without it being asked", () => {
  const target = fakeDocument()
  render(<Probe target={target as unknown as FullscreenDocument} />)
  act(() => target.enter())
  expect(seen.active).toBe(true)

  // A back gesture, a system bar or Escape. The control must not still offer to leave a
  // state the app is no longer in.
  act(() => target.leave())

  expect(seen.active).toBe(false)
})

test("is not offered where the browser cannot do it", () => {
  const target = fakeDocument({ supported: false })
  render(<Probe target={target as unknown as FullscreenDocument} />)

  // Absent rather than present and inert, like every other control here.
  expect(seen.supported).toBe(false)
})

test("survives a browser that refuses", async () => {
  const target = fakeDocument()
  target.documentElement.requestFullscreen = vi.fn(async () => {
    throw new Error("refused outside a user gesture")
  })
  render(<Probe target={target as unknown as FullscreenDocument} />)

  // Refusal is a real outcome and must not reach a render as an unhandled rejection.
  expect(() => seen.toggle()).not.toThrow()
  await Promise.resolve()
  expect(seen.active).toBe(false)
})
