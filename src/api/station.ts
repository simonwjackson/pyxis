import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { PlaylistRequest, PlaylistResponse, GetGenreStationsResponse, GetStationRequest, GetStationResponse, ShareStationRequest, TransformSharedStationRequest, TransformSharedStationResponse, AddMusicRequest, AddMusicResponse, DeleteMusicRequest, AddFeedbackRequest, AddFeedbackResponse, DeleteFeedbackRequest, CreateStationRequest, CreateStationResponse, DeleteStationRequest, RenameStationRequest, RenameStationResponse } from "../types/api.js"
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

export const getGenreStations = (
  state: AuthState
): Effect.Effect<GetGenreStationsResponse, ApiCallError> =>
  callPandoraMethod<GetGenreStationsResponse>(
    state,
    "station.getGenreStations",
    {},
    { encrypted: true }
  )

export const getStation = (
  state: AuthState,
  request: GetStationRequest
): Effect.Effect<GetStationResponse, ApiCallError> =>
  callPandoraMethod<GetStationResponse>(
    state,
    "station.getStation",
    request,
    { encrypted: true }
  )

export const shareStation = (
  state: AuthState,
  request: ShareStationRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "station.shareStation",
    request,
    { encrypted: true }
  )

export const transformSharedStation = (
  state: AuthState,
  request: TransformSharedStationRequest
): Effect.Effect<TransformSharedStationResponse, ApiCallError> =>
  callPandoraMethod<TransformSharedStationResponse>(
    state,
    "station.transformSharedStation",
    request,
    { encrypted: true }
  )

export const addFeedback = (
  state: AuthState,
  request: AddFeedbackRequest
): Effect.Effect<AddFeedbackResponse, ApiCallError> =>
  callPandoraMethod<AddFeedbackResponse>(
    state,
    "station.addFeedback",
    request,
    { encrypted: true }
  )

export const deleteFeedback = (
  state: AuthState,
  request: DeleteFeedbackRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "station.deleteFeedback",
    request,
    { encrypted: true }
  )

export const createStation = (
  state: AuthState,
  request: CreateStationRequest
): Effect.Effect<CreateStationResponse, ApiCallError> =>
  callPandoraMethod<CreateStationResponse>(
    state,
    "station.createStation",
    request,
    { encrypted: true }
  )

export const deleteStation = (
  state: AuthState,
  request: DeleteStationRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "station.deleteStation",
    request,
    { encrypted: true }
  )

export const renameStation = (
  state: AuthState,
  request: RenameStationRequest
): Effect.Effect<RenameStationResponse, ApiCallError> =>
  callPandoraMethod<RenameStationResponse>(
    state,
    "station.renameStation",
    request,
    { encrypted: true }
  )

export const addMusic = (
  state: AuthState,
  request: AddMusicRequest
): Effect.Effect<AddMusicResponse, ApiCallError> =>
  callPandoraMethod<AddMusicResponse>(
    state,
    "station.addMusic",
    request,
    { encrypted: true }
  )

export const deleteMusic = (
  state: AuthState,
  request: DeleteMusicRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "station.deleteMusic",
    request,
    { encrypted: true }
  )
