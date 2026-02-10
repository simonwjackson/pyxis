/**
 * @module pandora/api/user
 * User account API for Pandora.
 * Provides functions for station list, bookmarks, settings, usage info, and song management.
 */
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

/**
 * Authentication state required for authenticated Pandora API calls.
 */
type AuthState = {
  /** Time offset between client and Pandora server (seconds) */
  readonly syncTime: number
  /** Unique identifier for the partner (device type) */
  readonly partnerId: string
  /** Authentication token for partner-level operations */
  readonly partnerAuthToken: string
  /** Authentication token for user-level operations */
  readonly userAuthToken: string
  /** Unique identifier for the authenticated user */
  readonly userId: string
}

/**
 * Retrieves the list of stations for the authenticated user.
 *
 * @param state - Authenticated session state with valid tokens
 * @returns User's stations including QuickMix and custom stations
 *
 * @effect
 * - Success: StationListResponse - array of station metadata
 * - Error: ApiCallError - when the API request fails
 */
export const getStationList = (
  state: AuthState
): Effect.Effect<StationListResponse, ApiCallError> =>
  callPandoraMethod<StationListResponse>(
    state,
    "user.getStationList",
    {},
    { encrypted: true }
  )

/**
 * Retrieves the user's bookmarked artists and songs.
 *
 * @param state - Authenticated session state with valid tokens
 * @returns User's bookmarked artists and songs
 *
 * @effect
 * - Success: GetBookmarksResponse - arrays of artist and song bookmarks
 * - Error: ApiCallError - when the API request fails
 */
export const getBookmarks = (
  state: AuthState
): Effect.Effect<GetBookmarksResponse, ApiCallError> =>
  callPandoraMethod<GetBookmarksResponse>(
    state,
    "user.getBookmarks",
    {},
    { encrypted: true }
  )

/**
 * Retrieves the user's account settings.
 *
 * @param state - Authenticated session state with valid tokens
 * @returns User's account settings and preferences
 *
 * @effect
 * - Success: GetSettingsResponse - user settings including explicit filter status
 * - Error: ApiCallError - when the API request fails
 */
export const getSettings = (
  state: AuthState
): Effect.Effect<GetSettingsResponse, ApiCallError> =>
  callPandoraMethod<GetSettingsResponse>(
    state,
    "user.getSettings",
    {},
    { encrypted: true }
  )

/**
 * Retrieves usage information for the authenticated user's account.
 *
 * @param state - Authenticated session state with valid tokens
 * @returns Account usage statistics and limits
 *
 * @effect
 * - Success: GetUsageInfoResponse - usage data including listening hours
 * - Error: ApiCallError - when the API request fails
 */
export const getUsageInfo = (
  state: AuthState
): Effect.Effect<GetUsageInfoResponse, ApiCallError> =>
  callPandoraMethod<GetUsageInfoResponse>(
    state,
    "user.getUsageInfo",
    {},
    { encrypted: true }
  )

/**
 * Retrieves a checksum of the user's station list for change detection.
 * Use this to determine if the station list has changed without fetching the full list.
 *
 * @param state - Authenticated session state with valid tokens
 * @returns Checksum value that changes when stations are added/removed/modified
 *
 * @effect
 * - Success: GetStationListChecksumResponse - checksum string for comparison
 * - Error: ApiCallError - when the API request fails
 */
export const getStationListChecksum = (
  state: AuthState
): Effect.Effect<GetStationListChecksumResponse, ApiCallError> =>
  callPandoraMethod<GetStationListChecksumResponse>(
    state,
    "user.getStationListChecksum",
    {},
    { encrypted: true }
  )

/**
 * Configures which stations are included in the QuickMix (Shuffle) station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing array of station IDs to include
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Updates user account settings.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Settings to update (gender, birthYear, zipCode, isProfilePrivate)
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Enables or disables the explicit content filter for the user.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing isExplicitContentFilterEnabled flag
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Temporarily hides a song from playback for 30 days ("I'm tired of this song").
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing trackToken of the song to sleep
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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
