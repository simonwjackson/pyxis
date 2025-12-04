import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { ExplainTrackRequest, ExplainTrackResponse } from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userAuthToken: string
  readonly userId: string
}

export const explainTrack = (
  state: AuthState,
  request: ExplainTrackRequest
): Effect.Effect<ExplainTrackResponse, ApiCallError> =>
  callPandoraMethod<ExplainTrackResponse>(
    state,
    "track.explainTrack",
    request,
    { encrypted: true }
  )
