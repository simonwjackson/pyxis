import { Effect } from "effect"
import { PANDORA_API_URL, ANDROID_DEVICE } from "../constants.js"
import { encryptJson } from "../crypto/index.js"
import { ApiCallError } from "../types/errors.js"
import type { ApiResponse } from "../types/api.js"
import { httpRequest } from "../http/client.js"

export type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userId: string
  readonly userAuthToken: string
}

const unixTimestamp = (): number => Math.floor(Date.now() / 1000)

export const callPandoraMethod = <T>(
  state: AuthState,
  method: string,
  data: Record<string, unknown>,
  options: { encrypted: boolean }
): Effect.Effect<T, ApiCallError> =>
  Effect.gen(function* () {
    const syncTime = unixTimestamp() + state.syncTime

    const params = new URLSearchParams({
      method,
      auth_token: state.userAuthToken,
      partner_id: state.partnerId,
      user_id: state.userId
    })

    const payload = {
      ...data,
      userAuthToken: state.userAuthToken,
      syncTime
    }

    const body = options.encrypted
      ? yield* encryptJson(ANDROID_DEVICE.encryptKey)(payload).pipe(
          Effect.mapError((e) => new ApiCallError({
            method,
            message: "Encryption failed",
            cause: e
          }))
        )
      : JSON.stringify(payload)

    const response = yield* httpRequest<T>({
      url: `${PANDORA_API_URL}?${params}`,
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      apiMethod: method
    })

    if (response.stat !== "ok") {
      return yield* Effect.fail(
        new ApiCallError({ method, message: "API returned error status" })
      )
    }

    return response.result
  })
