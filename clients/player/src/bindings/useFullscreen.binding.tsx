/// Whether the app has the whole screen, and how to ask for it.
///
/// A binding because it reads and writes `document`, which is a global and therefore off
/// limits everywhere below one.
///
/// Two separate mechanisms give an app the screen and they are easy to confuse. The manifest's
/// `display: fullscreen` applies only to an installed app, and only from the install onward:
/// a browser reads the manifest when the app is added to the home screen and keeps that copy,
/// so changing it later does nothing for an app already installed. The Fullscreen API works
/// anywhere, including a plain tab, but cannot be asked for on load -- it requires a gesture,
/// so somebody has to press something. Hence a control rather than an effect.

import { useCallback, useEffect, useState } from "react"

export interface FullscreenDocument {
  readonly fullscreenElement: unknown
  readonly documentElement: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
  }
  readonly exitFullscreen?: () => Promise<void>
  addEventListener(type: "fullscreenchange", listener: () => void): void
  removeEventListener(type: "fullscreenchange", listener: () => void): void
}

export interface FullscreenBinding {
  /// False where the browser has no Fullscreen API at all. The control is then not offered,
  /// rather than offered and inert.
  readonly supported: boolean
  readonly active: boolean
  readonly toggle: () => void
}

export function useFullscreen(target?: FullscreenDocument): FullscreenBinding {
  const [active, setActive] = useState(false)

  // Tracked by listening rather than by remembering what was asked for. Leaving full screen
  // is something a person can do without this app -- a back gesture, a system bar, Escape --
  // and a control that then still says "Exit" is lying about the state of the screen.
  useEffect(() => {
    if (target === undefined) return
    const sync = () => setActive(target.fullscreenElement != null)
    sync()
    target.addEventListener("fullscreenchange", sync)
    return () => target.removeEventListener("fullscreenchange", sync)
  }, [target])

  const toggle = useCallback(() => {
    if (target === undefined) return
    if (target.fullscreenElement != null) {
      void target.exitFullscreen?.().catch(() => undefined)
      return
    }
    // `navigationUI: "hide"` asks for the system bars to go too, which is the difference
    // between a big window and the whole screen. A browser that will not honour it still
    // gives full screen, so it is a request rather than a condition.
    void target.documentElement
      .requestFullscreen?.({ navigationUI: "hide" })
      // A refusal is a real outcome: some browsers refuse outside a gesture, and some refuse
      // entirely. The listener above keeps the label honest either way.
      .catch(() => undefined)
  }, [target])

  return {
    supported:
      target !== undefined && typeof target.documentElement.requestFullscreen === "function",
    active,
    toggle,
  }
}
