/**
 * @module pandora/api/music
 * Music catalog API for Pandora.
 * Provides functions for searching the catalog, getting track details, and sharing music.
 */
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
 * Searches Pandora's music catalog for artists, songs, and genre stations.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Search request containing the search text
 * @returns Search results with matching artists, songs, and genre stations
 *
 * @effect
 * - Success: MusicSearchResponse - arrays of matching artists, songs, and genre stations
 * - Error: ApiCallError - when the API request fails
 */
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

/**
 * Retrieves detailed information about a specific track.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing trackToken to look up
 * @returns Detailed track metadata including artist, album, and URLs
 *
 * @effect
 * - Success: GetTrackResponse - detailed track information
 * - Error: ApiCallError - when the API request fails or track not found
 */
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

/**
 * Shares a track or artist with another user via email.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing musicToken and recipient email
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
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
