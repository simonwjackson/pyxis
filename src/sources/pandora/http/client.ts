/**
 * @module pandora/http/client
 * HTTP client with fixture support for Pandora API calls.
 * Supports live requests, recording fixtures for testing, and replaying recorded fixtures.
 */
import { Effect } from "effect"
import { getFixtureMode, saveFixture, loadFixture, fixtureExists } from "../fixtures/index.js"
import { ApiCallError } from "../types/errors.js"
import type { ApiResponse } from "../types/api.js"

/**
 * HTTP request configuration for Pandora API calls.
 */
export type HttpRequest = {
  /** Full URL including query parameters */
  readonly url: string
  /** HTTP method (POST for Pandora API) */
  readonly method: string
  /** Request headers */
  readonly headers: Record<string, string>
  /** Request body (JSON or encrypted payload) */
  readonly body: string
  /** API method name for fixture naming (e.g., "user.getStationList") */
  readonly apiMethod: string
}

/**
 * Makes an HTTP request to the Pandora API with fixture support.
 * Behavior depends on PYXIS_FIXTURE_MODE environment variable:
 * - "live" (default): Makes real network requests
 * - "record": Makes real requests and saves responses as fixtures
 * - "replay": Loads responses from previously recorded fixtures
 *
 * @typeParam T - Expected response result type
 * @param request - HTTP request configuration
 * @returns API response wrapper containing the result
 *
 * @effect
 * - Success: ApiResponse<T> - the parsed JSON response
 * - Error: ApiCallError - on network errors, invalid JSON, or missing fixtures
 */
export const httpRequest = <T>(
  request: HttpRequest
): Effect.Effect<ApiResponse<T>, ApiCallError> =>
  Effect.gen(function* () {
    const mode = yield* getFixtureMode()

    // Replay mode: load from fixture
    if (mode === "replay") {
      const exists = yield* fixtureExists(request.apiMethod)
      if (exists) {
        return yield* loadFixture<ApiResponse<T>>(request.apiMethod).pipe(
          Effect.mapError((e) => new ApiCallError({
            method: request.apiMethod,
            message: `Fixture load failed: ${e.message}`,
            cause: e
          }))
        )
      }
      return yield* Effect.fail(new ApiCallError({
        method: request.apiMethod,
        message: `No fixture found for ${request.apiMethod}. Run with PYXIS_FIXTURE_MODE=record first.`
      }))
    }

    // Live or Record mode: make real request
    const response = yield* Effect.tryPromise({
      try: () => fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      }),
      catch: (cause) => new ApiCallError({
        method: request.apiMethod,
        message: "Network error",
        cause
      })
    })

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<ApiResponse<T>>,
      catch: (cause) => new ApiCallError({
        method: request.apiMethod,
        message: "Invalid JSON response",
        cause
      })
    })

    // Record mode: save fixture
    if (mode === "record") {
      yield* saveFixture(request.apiMethod, json).pipe(
        Effect.catchAll(() => Effect.void)  // Don't fail on save errors
      )
    }

    return json
  })
