import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { 
  StationListResponse, 
  GetBookmarksResponse,
  GetSettingsResponse,
  GetUsageInfoResponse,
  GetStationListChecksumResponse,
  SetQuickMixRequest,
  ChangeSettingsRequest,
  SetExplicitContentFilterRequest,
  SleepSongRequest
} from "../types/api.js"
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

export const getBookmarks = (
  state: AuthState
): Effect.Effect<GetBookmarksResponse, ApiCallError> =>
  callPandoraMethod<GetBookmarksResponse>(
    state,
    "user.getBookmarks",
    {},
    { encrypted: true }
  )

export const getSettings = (
  state: AuthState
): Effect.Effect<GetSettingsResponse, ApiCallError> =>
  callPandoraMethod<GetSettingsResponse>(
    state,
    "user.getSettings",
    {},
    { encrypted: true }
  )

export const getUsageInfo = (
  state: AuthState
): Effect.Effect<GetUsageInfoResponse, ApiCallError> =>
  callPandoraMethod<GetUsageInfoResponse>(
    state,
    "user.getUsageInfo",
    {},
    { encrypted: true }
  )

export const getStationListChecksum = (
  state: AuthState
): Effect.Effect<GetStationListChecksumResponse, ApiCallError> =>
  callPandoraMethod<GetStationListChecksumResponse>(
    state,
    "user.getStationListChecksum",
    {},
    { encrypted: true }
  )

export const setQuickMix = (
  state: AuthState,
  request: SetQuickMixRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "user.setQuickMix",
    request,
    { encrypted: true }
  )

export const changeSettings = (
  state: AuthState,
  request: ChangeSettingsRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "user.changeSettings",
    request,
    { encrypted: true }
  )

export const setExplicitContentFilter = (
  state: AuthState,
  request: SetExplicitContentFilterRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "user.setExplicitContentFilter",
    request,
    { encrypted: true }
  )

export const sleepSong = (
  state: AuthState,
  request: SleepSongRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "user.sleepSong",
    request,
    { encrypted: true }
  )
