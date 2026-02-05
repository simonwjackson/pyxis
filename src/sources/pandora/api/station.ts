/**
 * @module pandora/api/station
 *
 * Station management API for Pandora. Provides functions for retrieving playlists,
 * managing stations (create, delete, rename), adding/removing seeds (music),
 * submitting feedback (thumbs up/down), and station sharing.
 *
 * All functions require an authenticated session (AuthState) and use
 * encrypted API calls via callPandoraMethod.
 */
import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { PlaylistRequest, PlaylistResponse, GetGenreStationsResponse, GetStationRequest, GetStationResponse, ShareStationRequest, TransformSharedStationRequest, TransformSharedStationResponse, AddMusicRequest, AddMusicResponse, DeleteMusicRequest, AddFeedbackRequest, AddFeedbackResponse, DeleteFeedbackRequest, CreateStationRequest, CreateStationResponse, DeleteStationRequest, RenameStationRequest, RenameStationResponse } from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

/**
 * Authentication state required for authenticated Pandora API calls.
 * Contains all tokens and timing data from the login flow.
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
 * Retrieves a playlist of tracks from a station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken and optional audio format preferences
 * @returns Playlist response with playable track items including audio URLs
 *
 * @effect
 * - Success: PlaylistResponse - array of playlist items with track metadata and audio URLs
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Retrieves available genre stations organized by category.
 * Genre stations are pre-defined stations like "Today's Hits" or "Classical".
 *
 * @param state - Authenticated session state with valid tokens
 * @returns Genre stations grouped by category
 *
 * @effect
 * - Success: GetGenreStationsResponse - categorized list of genre stations
 * - Error: ApiCallError - when the API request fails
 */
export const getGenreStations = (
  state: AuthState
): Effect.Effect<GetGenreStationsResponse, ApiCallError> =>
  callPandoraMethod<GetGenreStationsResponse>(
    state,
    "station.getGenreStations",
    {},
    { encrypted: true }
  )

/**
 * Retrieves detailed information about a specific station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken and optional flags for extended info
 * @returns Complete station details including seeds and feedback
 *
 * @effect
 * - Success: GetStationResponse - detailed station information
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Shares a station with other users via email.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationId, stationToken, and recipient emails
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Converts a shared station into a personal station for the user.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken of the shared station
 * @returns Transformed station information
 *
 * @effect
 * - Success: TransformSharedStationResponse - new station details
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Adds feedback (thumbs up/down) for a track on a station.
 * Feedback influences the station's music selection algorithm.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken, trackToken, and isPositive flag
 * @returns Feedback confirmation with feedbackId
 *
 * @effect
 * - Success: AddFeedbackResponse - feedback details including feedbackId for deletion
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Removes previously submitted feedback from a station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing feedbackId to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or feedback not found
 */
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

/**
 * Creates a new station based on a music token (artist, track, or genre).
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing musicToken to seed the new station
 * @returns Created station details including stationToken
 *
 * @effect
 * - Success: CreateStationResponse - new station information
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Permanently deletes a station from the user's account.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken of the station to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or station not found
 */
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

/**
 * Renames an existing station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken and new stationName
 * @returns Updated station details
 *
 * @effect
 * - Success: RenameStationResponse - renamed station information
 * - Error: ApiCallError - when the API request fails or station not found
 */
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

/**
 * Adds a seed (artist, track, or genre) to a station to influence its music selection.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing stationToken and musicToken of the seed
 * @returns Confirmation with seed details
 *
 * @effect
 * - Success: AddMusicResponse - details of the added seed
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Removes a seed from a station.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing seedId of the seed to remove
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or seed not found
 */
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
