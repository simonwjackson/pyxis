import type { RpcSession } from "../../../../contracts/generated/pyxis"

import { type SleepStop, sleepSchedule } from "../worker/sleep-schedule"

// A media element can have only one MediaElementAudioSourceNode in its lifetime,
// including across React ref detaches and host recreation. Only timed elements use it.
const nativeGains = new WeakMap<HTMLAudioElement, GainNode>()
let context: AudioContext | undefined

function nativeGain(element: HTMLAudioElement): GainNode | undefined {
  const existing = nativeGains.get(element)
  if (existing) return existing
  if (typeof AudioContext === "undefined") return undefined
  context ??= new AudioContext()
  // Do not divert an audible element into a graph blocked by autoplay policy.
  if (context.state !== "running") return undefined
  const gain = context.createGain()
  context.createMediaElementSource(element).connect(gain)
  gain.connect(context.destination)
  nativeGains.set(element, gain)
  return gain
}

export function createLocalSleepTimer(
  expire: (sessionId: string, stop: SleepStop, stillScheduled: () => boolean) => Promise<void>,
  failure: (cause: unknown) => void,
) {
  let session: RpcSession | undefined
  let audio: HTMLAudioElement | null = null
  let gain: GainNode | undefined
  let wake: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let firing: string | undefined
  let nativeRefused = false

  function clear() {
    if (!session) return
    generation += 1
    context?.removeEventListener("statechange", tick)
    clearTimeout(wake)
    document.removeEventListener("visibilitychange", tick)
    window.removeEventListener("pageshow", tick)
    audio?.removeEventListener("timeupdate", tick)
    if (gain) {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 1
    }
    if (audio && session) audio.volume = session.volume / 100
    gain = undefined
    nativeRefused = false
    session = undefined
    audio = null
  }

  function tick(): boolean {
    clearTimeout(wake)
    const target = session
    const timer = target?.sleepTimer
    if (!target || !timer) return false
    let schedule: ReturnType<typeof sleepSchedule>
    try {
      schedule = sleepSchedule(target)
    } catch (cause) {
      clear()
      failure(cause)
      return false
    }
    if (schedule.kind === "disarmed") return false
    const factor = schedule.kind === "stop" ? 0 : schedule.gain
    if (audio) {
      if (!gain && !nativeRefused && context?.state === "running") {
        try {
          gain = nativeGain(audio)
        } catch (cause) {
          nativeRefused = true
          failure(cause)
        }
      }
      if (gain) {
        // Submit the cutoff to the audio rendering clock ahead of time. Throttled
        // or frozen page JS need not wake for the audio to fall silent.
        const now = gain.context.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(factor, now)
        if (schedule.kind === "armed") {
          const end = now + schedule.remainingMs / 1000
          if (schedule.fadeMs === 0) gain.gain.setValueAtTime(0, end)
          else {
            if (schedule.fadeStartInMs > 0)
              gain.gain.setValueAtTime(1, now + schedule.fadeStartInMs / 1000)
            gain.gain.linearRampToValueAtTime(0, end)
          }
        }
      }
      audio.volume = (target.volume / 100) * (gain ? 1 : factor)
    }
    if (schedule.kind === "stop") {
      if (firing !== timer.id) {
        const mine = generation
        firing = timer.id
        void expire(target.id, schedule, () => generation === mine)
          .catch(failure)
          .finally(() => {
            if (firing === timer.id) {
              firing = undefined
              if (session?.sleepTimer?.id === timer.id) wake = setTimeout(tick, 1000)
            }
          })
      }
      return true
    }
    const next =
      gain || schedule.fadeMs === 0
        ? schedule.remainingMs
        : schedule.fadeStartInMs || Math.min(250, schedule.remainingMs)
    wake = setTimeout(tick, Math.min(next, 2147483647))
    return false
  }

  function update(target: RpcSession | undefined, element: HTMLAudioElement | null): boolean {
    if (!target?.sleepTimer) {
      clear()
      return false
    }
    if (
      session?.id !== target.id ||
      session.sleepTimer?.id !== target.sleepTimer.id ||
      audio !== element
    ) {
      clear()
      audio = element
      if (audio) {
        try {
          gain = nativeGain(audio)
          context?.addEventListener("statechange", tick)
          if (context?.state === "suspended") void context.resume().catch(failure)
        } catch (cause) {
          nativeRefused = true
          failure(cause)
        }
        audio.addEventListener("timeupdate", tick)
      }
      document.addEventListener("visibilitychange", tick)
      window.addEventListener("pageshow", tick)
    }
    session = target
    return tick()
  }
  return { update, clear }
}
