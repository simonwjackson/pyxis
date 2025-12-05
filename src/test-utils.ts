/**
 * Test utilities for Effect-TS based tests with Bun test runner
 */

import { Effect, Exit, Cause } from "effect"

/**
 * Run an Effect and return the success value, throwing on failure
 * Use in tests where you expect success
 */
export const runEffectTest = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<A> =>
  Effect.runPromise(effect)

/**
 * Run an Effect and return the Exit, allowing inspection of both success and failure
 */
export const runEffectExit = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(effect)

/**
 * Assert that an Effect fails with a specific error type
 * Returns the error for further assertions
 */
export const expectEffectFailure = async <E>(
  effect: Effect.Effect<unknown, E>
): Promise<E> => {
  const exit = await runEffectExit(effect)
  if (Exit.isSuccess(exit)) {
    throw new Error(`Expected Effect to fail, but it succeeded with: ${JSON.stringify(exit.value)}`)
  }
  // Extract the actual failure from the Cause
  const failures = Cause.failures(exit.cause)
  const firstFailure = Array.from(failures)[0]
  if (firstFailure === undefined) {
    throw new Error(`Expected Effect to fail with an error, but got: ${JSON.stringify(exit.cause)}`)
  }
  return firstFailure
}

/**
 * Assert that an Effect succeeds
 * Returns the value for further assertions
 */
export const expectEffectSuccess = async <A, E>(
  effect: Effect.Effect<A, E>
): Promise<A> => {
  const exit = await runEffectExit(effect)
  if (Exit.isFailure(exit)) {
    throw new Error(`Expected Effect to succeed, but it failed with: ${JSON.stringify(exit.cause)}`)
  }
  return exit.value
}

/**
 * Set fixture mode for testing
 * Call this before tests that need a specific fixture mode
 */
export const setFixtureMode = (mode: "record" | "replay" | "live"): void => {
  process.env.PYXIS_FIXTURE_MODE = mode
}

/**
 * Reset fixture mode to default (live)
 */
export const resetFixtureMode = (): void => {
  delete process.env.PYXIS_FIXTURE_MODE
}

/**
 * Run a test with a specific fixture mode, then reset
 */
export const withFixtureMode = async <T>(
  mode: "record" | "replay" | "live",
  fn: () => T | Promise<T>
): Promise<T> => {
  setFixtureMode(mode)
  try {
    const result = fn()
    if (result instanceof Promise) {
      return await result.finally(() => resetFixtureMode())
    }
    resetFixtureMode()
    return result
  } catch (e) {
    resetFixtureMode()
    throw e
  }
}
