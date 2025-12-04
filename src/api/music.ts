import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { 
  MusicSearchRequest, 
  MusicSearchResponse,
  GetTrackRequest,
  GetTrackResponse,
  ShareMusicRequest
} from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userAuthToken: string
  readonly userId: string
}

export const search = (
  state: AuthState,
  request: MusicSearchRequest
): Effect.Effect<MusicSearchResponse, ApiCallError> =>
  callPandoraMethod<MusicSearchResponse>(
    state,
    "music.search",
    request,
    { encrypted: true }
  )

export const getTrack = (
  state: AuthState,
  request: GetTrackRequest
): Effect.Effect<GetTrackResponse, ApiCallError> =>
  callPandoraMethod<GetTrackResponse>(
    state,
    "music.getTrack",
    request,
    { encrypted: true }
  )

export const shareMusic = (
  state: AuthState,
  request: ShareMusicRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "music.shareMusic",
    request,
    { encrypted: true }
  )
