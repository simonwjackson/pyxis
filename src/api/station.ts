import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { PlaylistRequest, PlaylistResponse } from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userAuthToken: string
  readonly userId: string
}

export const getPlaylist = (
  state: AuthState,
  request: PlaylistRequest
): Effect.Effect<PlaylistResponse, ApiCallError> =>
  callPandoraMethod<PlaylistResponse>(
    state,
    "station.getPlaylist",
    request,
    { encrypted: true }
  )
