// @vitest-environment node
import { expect, test } from "vitest"
import { sleepSchedule } from "./sleep-schedule"

test("a host can schedule fade, replacement, cancel and wake without a DOM or network", () => {
  const original = {
    volume: 64,
    sleepTimer: { id: "first", deadline: new Date(20000).toISOString(), fadeSeconds: 4 },
  }
  expect(sleepSchedule(original, 10000)).toEqual({
    kind: "armed",
    gain: 1,
    remainingMs: 10000,
    fadeStartInMs: 6000,
    fadeMs: 4000,
  })
  expect(sleepSchedule(original, 18000)).toMatchObject({
    kind: "armed",
    gain: 0.5,
    remainingMs: 2000,
    fadeStartInMs: 0,
  })
  const replacement = {
    ...original,
    sleepTimer: { id: "second", deadline: new Date(30000).toISOString(), fadeSeconds: 0 },
  }
  expect(sleepSchedule(replacement, 21000)).toMatchObject({
    kind: "armed",
    gain: 1,
    remainingMs: 9000,
  })
  expect(sleepSchedule({ volume: 64 }, 31000)).toEqual({ kind: "disarmed" })
  const stop = sleepSchedule(replacement, 31000)
  expect(stop).toEqual({
    kind: "stop",
    restoreVolume: 64,
    command: { _tag: "transport.stop", payload: { sleepTimerId: "second" } },
    commandId: "sleep:second",
  })
  expect(sleepSchedule(replacement, 45000)).toEqual(stop)
})
