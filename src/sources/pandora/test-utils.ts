/**
 * @module pandora/test-utils
 * Test utilities for Effect-TS based tests with Bun test runner.
 * Provides helpers for running Effects in tests and managing fixture modes.
 */

import { Effect, Exit, Cause } from "effect"

/**
 * Runs an Effect and returns the success value, throwing on failure.
 * Use in tests where you expect the Effect to succeed.
 *
 * @typeParam A - Success value type
 * @typeParam E - Error type
 * @param effect - Effect to execute
 * @returns Promise resolving to the success value
 * @throws When the Effect fails
 */
export const runEffectTest = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<A> =>
  Effect.runPromise(effect)

/**
 * Runs an Effect and returns the Exit, allowing inspection of both success and failure.
 * Useful when testing both success and failure cases.
 *
 * @typeParam A - Success value type
 * @typeParam E - Error type
 * @param effect - Effect to execute
 * @returns Promise resolving to Exit containing either success value or failure cause
 */
export const runEffectExit = <A, E>(
  effect: Effect.Effect<A, E>
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(effect)

/**
 * Asserts that an Effect fails and extracts the error for further assertions.
 * Throws if the Effect succeeds instead of failing.
 *
 * @typeParam E - Expected error type
 * @param effect - Effect expected to fail
 * @returns Promise resolving to the failure error
 * @throws When the Effect succeeds instead of failing
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
 * Asserts that an Effect succeeds and extracts the value for further assertions.
 * Throws if the Effect fails instead of succeeding.
 *
 * @typeParam A - Expected success value type
 * @typeParam E - Error type
 * @param effect - Effect expected to succeed
 * @returns Promise resolving to the success value
 * @throws When the Effect fails instead of succeeding
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
 * Sets the fixture mode for testing via environment variable.
 * Call this before tests that need a specific fixture mode.
 *
 * @param mode - Fixture mode: "record" saves responses, "replay" loads fixtures, "live" makes real requests
 */
export const setFixtureMode = (mode: "record" | "replay" | "live"): void => {
  process.env.PYXIS_FIXTURE_MODE = mode
}

/**
 * Resets fixture mode to default (live) by clearing the environment variable.
 */
export const resetFixtureMode = (): void => {
  delete process.env.PYXIS_FIXTURE_MODE
}

/**
 * Runs a test function with a specific fixture mode, then resets to default.
 * Ensures fixture mode is always reset even if the test throws.
 *
 * @typeParam T - Return type of the test function
 * @param mode - Fixture mode to use during the test
 * @param fn - Test function to execute
 * @returns Promise resolving to the test function's return value
 *
 * @example
 * ```ts
 * await withFixtureMode("replay", async () => {
 *   const result = await runEffectTest(someApiCall());
 *   expect(result).toBeDefined();
 * });
 * ```
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
