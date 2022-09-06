import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { StationListResponse } from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userAuthToken: string
  readonly userId: string
}

export const getStationList = (
  state: AuthState
): Effect.Effect<StationListResponse, ApiCallError> =>
  callPandoraMethod<StationListResponse>(
    state,
    "user.getStationList",
    {},
    { encrypted: true }
  )
