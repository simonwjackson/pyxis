import { Effect } from "effect"
import { getFixtureMode, saveFixture, loadFixture, fixtureExists } from "../fixtures/index.js"
import { ApiCallError } from "../types/errors.js"
import type { ApiResponse } from "../types/api.js"

export type HttpRequest = {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string
  readonly apiMethod: string  // For fixture naming
}

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
        message: `No fixture found for ${request.apiMethod}. Run with PANDORA_FIXTURE_MODE=record first.`
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
