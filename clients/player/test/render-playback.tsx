import { renderHook } from "@testing-library/react"
import { useEffect, useMemo } from "react"
import type { PlaybackBinding } from "../src/bindings/usePlayback.binding"

// State/ordering tests use a configured local media element. Native permission and
// decoding behavior are verified separately by the browser fixture.
export function renderPlayback(read: () => PlaybackBinding) {
  return renderHook(() => {
    const binding = read()
    const audio = useMemo(() => {
      const element = document.createElement("audio")
      element.play = async () => {}
      element.pause = () => {}
      return element
    }, [])
    useEffect(() => {
      if (binding.audioUrl !== undefined) audio.setAttribute("src", binding.audioUrl)
      binding.attachAudio(audio)
      return () => binding.attachAudio(null)
    }, [audio, binding.attachAudio, binding.audioUrl])
    return binding
  })
}
