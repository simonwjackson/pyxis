/**
 * @module pandora/api/track
 * Track-specific API for Pandora.
 * Provides functions for getting Music Genome explanations of why tracks were played.
 */
import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type { ExplainTrackRequest, ExplainTrackResponse } from "../types/api.js"
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
 * Retrieves the Music Genome explanation for why a track was played on a station.
 * Shows the musical attributes that matched the station's profile.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing trackToken to explain
 * @returns Musical attribute explanations (e.g., "acoustic texture", "folk influences")
 *
 * @effect
 * - Success: ExplainTrackResponse - array of musical attribute explanations
 * - Error: ApiCallError - when the API request fails
 */
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
