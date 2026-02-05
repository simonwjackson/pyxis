/**
 * @module pandora/client
 *
 * High-level Pandora API client providing a unified interface for all Pandora operations.
 * This module wraps lower-level API modules and exposes typed Effect-based functions
 * for authentication, station management, playlist retrieval, bookmarks, and user settings.
 */
import { Effect } from "effect"
import * as Auth from "./api/auth.js"
import * as User from "./api/user.js"
import * as Station from "./api/station.js"
import * as Bookmark from "./api/bookmark.js"
import * as Music from "./api/music.js"
import * as Track from "./api/track.js"
import { getAudioFormat, DEFAULT_QUALITY } from "./quality.js"
import type { Quality } from "./quality.js"
import type {
  StationListResponse,
  PlaylistRequest,
  PlaylistResponse,
  GetStationRequest,
  GetStationResponse,
  GetGenreStationsResponse,
  MusicSearchResponse,
  GetBookmarksResponse,
  GetSettingsResponse,
  GetUsageInfoResponse,
  GetStationListChecksumResponse,
  AddFeedbackResponse,
  AddArtistBookmarkRequest,
  AddArtistBookmarkResponse,
  AddSongBookmarkRequest,
  AddSongBookmarkResponse,
  DeleteBookmarkRequest,
  SetQuickMixRequest,
  ChangeSettingsRequest,
  SetExplicitContentFilterRequest,
  AddMusicRequest,
  AddMusicResponse,
  DeleteMusicRequest,
  ShareStationRequest,
  TransformSharedStationRequest,
  TransformSharedStationResponse,
  CreateStationRequest,
  CreateStationResponse,
  DeleteStationRequest,
  RenameStationRequest,
  RenameStationResponse,
  ExplainTrackResponse,
  GetTrackResponse
} from "./types/api.js"
import type { PandoraError } from "./types/errors.js"

/**
 * Represents an authenticated Pandora session containing all tokens and timing data
 * required for making authenticated API calls.
 *
 * @property syncTime - Time offset between client and Pandora server (seconds)
 * @property partnerId - Unique identifier for the partner (device type)
 * @property partnerAuthToken - Authentication token for partner-level operations
 * @property userId - Unique identifier for the authenticated user
 * @property userAuthToken - Authentication token for user-level operations
 */
export type PandoraSession = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userId: string
  readonly userAuthToken: string
}

/**
 * Authenticates a user with Pandora and establishes a session.
 * Performs two-step authentication: partner login followed by user login.
 *
 * @param username - Pandora account email or username
 * @param password - Pandora account password
 * @returns A session object containing all authentication tokens
 *
 * @effect
 * - Success: PandoraSession - authenticated session with all required tokens
 * - Error: PartnerLoginError - when partner authentication fails
 * - Error: UserLoginError - when user credentials are invalid
 */
export const login = (
  username: string,
  password: string
): Effect.Effect<PandoraSession, PandoraError> =>
  Effect.gen(function* () {
    const partner = yield* Auth.partnerLogin()

    const user = yield* Auth.userLogin(
      partner.partnerId,
      partner.partnerAuthToken,
      partner.syncTimeOffset
    )(username, password)

    return {
      syncTime: partner.syncTimeOffset,
      partnerId: partner.partnerId,
      partnerAuthToken: partner.partnerAuthToken,
      userId: user.userId,
      userAuthToken: user.userAuthToken
    }
  })

/**
 * Retrieves the list of stations for the authenticated user.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns List of user's stations including QuickMix and custom stations
 *
 * @effect
 * - Success: StationListResponse - array of station metadata
 * - Error: ApiCallError - when the API request fails
 */
export const getStationList = (
  session: PandoraSession
): Effect.Effect<StationListResponse, PandoraError> =>
  User.getStationList(session)

/**
 * Retrieves a playlist of tracks from a station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Playlist request containing stationToken and optional audio format
 * @returns Playlist response with playable track items
 *
 * @effect
 * - Success: PlaylistResponse - array of playlist items with audio URLs
 * - Error: ApiCallError - when the API request fails
 */
export const getPlaylist = (
  session: PandoraSession,
  request: PlaylistRequest
): Effect.Effect<PlaylistResponse, PandoraError> =>
  Station.getPlaylist(session, request)

/**
 * Retrieves a playlist with a specific audio quality preference.
 * Automatically maps the quality setting to the appropriate audio format.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param stationToken - Unique token identifying the station
 * @param quality - Audio quality preference: "low", "medium", or "high" (default: DEFAULT_QUALITY)
 * @returns Playlist response with tracks at the requested quality
 *
 * @effect
 * - Success: PlaylistResponse - array of playlist items with audio URLs at requested quality
 * - Error: ApiCallError - when the API request fails
 */
export const getPlaylistWithQuality = (
  session: PandoraSession,
  stationToken: string,
  quality: Quality = DEFAULT_QUALITY
): Effect.Effect<PlaylistResponse, PandoraError> => {
  const audioFormat = getAudioFormat(quality)
  return Station.getPlaylist(session, audioFormat ? {
    stationToken,
    additionalAudioUrl: audioFormat
  } : {
    stationToken
  })
}

/**
 * Retrieves the list of available genre stations (pre-defined stations by category).
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns Genre stations organized by category
 *
 * @effect
 * - Success: GetGenreStationsResponse - categorized list of genre stations
 * - Error: ApiCallError - when the API request fails
 */
export const getGenreStations = (
  session: PandoraSession
): Effect.Effect<GetGenreStationsResponse, PandoraError> =>
  Station.getGenreStations(session)

/**
 * Searches Pandora's catalog for artists, songs, and composers.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param searchText - Query string to search for (artist name, song title, etc.)
 * @returns Search results containing matching artists, songs, and genre stations
 *
 * @effect
 * - Success: MusicSearchResponse - matching artists, songs, and stations
 * - Error: ApiCallError - when the API request fails
 */
export const search = (
  session: PandoraSession,
  searchText: string
): Effect.Effect<MusicSearchResponse, PandoraError> =>
  Music.search(session, { searchText })

/**
 * Retrieves the user's bookmarked artists and songs.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns User's bookmarked artists and songs
 *
 * @effect
 * - Success: GetBookmarksResponse - arrays of artist and song bookmarks
 * - Error: ApiCallError - when the API request fails
 */
export const getBookmarks = (
  session: PandoraSession
): Effect.Effect<GetBookmarksResponse, PandoraError> =>
  User.getBookmarks(session)

/**
 * Retrieves the user's account settings.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns User's account settings and preferences
 *
 * @effect
 * - Success: GetSettingsResponse - user settings including explicit filter status
 * - Error: ApiCallError - when the API request fails
 */
export const getSettings = (
  session: PandoraSession
): Effect.Effect<GetSettingsResponse, PandoraError> =>
  User.getSettings(session)

/**
 * Retrieves usage information for the authenticated user's account.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns Account usage statistics and limits
 *
 * @effect
 * - Success: GetUsageInfoResponse - usage data including listening hours
 * - Error: ApiCallError - when the API request fails
 */
export const getUsageInfo = (
  session: PandoraSession
): Effect.Effect<GetUsageInfoResponse, PandoraError> =>
  User.getUsageInfo(session)

/**
 * Retrieves a checksum of the user's station list for change detection.
 * Use this to determine if the station list has changed without fetching the full list.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @returns Checksum value that changes when stations are added/removed/modified
 *
 * @effect
 * - Success: GetStationListChecksumResponse - checksum string for comparison
 * - Error: ApiCallError - when the API request fails
 */
export const getStationListChecksum = (
  session: PandoraSession
): Effect.Effect<GetStationListChecksumResponse, PandoraError> =>
  User.getStationListChecksum(session)

/**
 * Retrieves detailed information about a specific station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationToken and optional extended info flags
 * @returns Detailed station information including seeds and feedback
 *
 * @effect
 * - Success: GetStationResponse - complete station details
 * - Error: ApiCallError - when the API request fails
 */
export const getStation = (
  session: PandoraSession,
  request: GetStationRequest
): Effect.Effect<GetStationResponse, PandoraError> =>
  Station.getStation(session, request)

/**
 * Adds feedback (thumbs up/down) for a track on a station.
 * Positive feedback influences the station to play more similar tracks.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param stationToken - Unique token identifying the station
 * @param trackToken - Unique token identifying the track being rated
 * @param isPositive - true for thumbs up, false for thumbs down
 * @returns Feedback confirmation with feedbackId for potential deletion
 *
 * @effect
 * - Success: AddFeedbackResponse - feedback details including feedbackId
 * - Error: ApiCallError - when the API request fails
 */
export const addFeedback = (
  session: PandoraSession,
  stationToken: string,
  trackToken: string,
  isPositive: boolean
): Effect.Effect<AddFeedbackResponse, PandoraError> =>
  Station.addFeedback(session, { stationToken, trackToken, isPositive })

/**
 * Removes previously submitted feedback from a station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param feedbackId - Unique identifier of the feedback to remove (from addFeedback response)
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or feedback not found
 */
export const deleteFeedback = (
  session: PandoraSession,
  feedbackId: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteFeedback(session, { feedbackId })

/**
 * Temporarily hides a song from playback for 30 days ("I'm tired of this song").
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param trackToken - Unique token identifying the track to sleep
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const sleepSong = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.sleepSong(session, { trackToken })

/**
 * Adds a seed (artist, track, or genre) to a station to influence its music selection.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationToken and musicToken of the seed to add
 * @returns Confirmation with seed details
 *
 * @effect
 * - Success: AddMusicResponse - details of the added seed
 * - Error: ApiCallError - when the API request fails
 */
export const addMusic = (
  session: PandoraSession,
  request: AddMusicRequest
): Effect.Effect<AddMusicResponse, PandoraError> =>
  Station.addMusic(session, request)

/**
 * Removes a seed from a station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing seedId of the seed to remove
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or seed not found
 */
export const deleteMusic = (
  session: PandoraSession,
  request: DeleteMusicRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteMusic(session, request)

/**
 * Bookmarks an artist for the user.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing trackToken of a track by the artist to bookmark
 * @returns Bookmark confirmation with bookmarkToken
 *
 * @effect
 * - Success: AddArtistBookmarkResponse - bookmark details including bookmarkToken
 * - Error: ApiCallError - when the API request fails
 */
export const addArtistBookmark = (
  session: PandoraSession,
  request: AddArtistBookmarkRequest
): Effect.Effect<AddArtistBookmarkResponse, PandoraError> =>
  Bookmark.addArtistBookmark(session, request)

/**
 * Bookmarks a song for the user.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing trackToken of the song to bookmark
 * @returns Bookmark confirmation with bookmarkToken
 *
 * @effect
 * - Success: AddSongBookmarkResponse - bookmark details including bookmarkToken
 * - Error: ApiCallError - when the API request fails
 */
export const addSongBookmark = (
  session: PandoraSession,
  request: AddSongBookmarkRequest
): Effect.Effect<AddSongBookmarkResponse, PandoraError> =>
  Bookmark.addSongBookmark(session, request)

/**
 * Removes an artist bookmark.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing bookmarkToken to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or bookmark not found
 */
export const deleteArtistBookmark = (
  session: PandoraSession,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Bookmark.deleteArtistBookmark(session, request)

/**
 * Removes a song bookmark.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing bookmarkToken to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or bookmark not found
 */
export const deleteSongBookmark = (
  session: PandoraSession,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Bookmark.deleteSongBookmark(session, request)

/**
 * Shares a station with another user via email.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationId, stationToken, and recipient emails
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const shareStation = (
  session: PandoraSession,
  request: ShareStationRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.shareStation(session, request)

/**
 * Converts a shared station into a personal station for the user.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationToken of the shared station
 * @returns New station details after transformation
 *
 * @effect
 * - Success: TransformSharedStationResponse - transformed station information
 * - Error: ApiCallError - when the API request fails
 */
export const transformSharedStation = (
  session: PandoraSession,
  request: TransformSharedStationRequest
): Effect.Effect<TransformSharedStationResponse, PandoraError> =>
  Station.transformSharedStation(session, request)

/**
 * Configures which stations are included in the QuickMix (Shuffle) station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param quickMixStationIds - Array of station IDs to include in QuickMix shuffle
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const setQuickMix = (
  session: PandoraSession,
  quickMixStationIds: readonly string[]
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.setQuickMix(session, { quickMixStationIds })

/**
 * Updates user account settings.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param settings - Settings to update (gender, birthYear, zipCode, isProfilePrivate)
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const changeSettings = (
  session: PandoraSession,
  settings: ChangeSettingsRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.changeSettings(session, settings)

/**
 * Enables or disables the explicit content filter for the user.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param isExplicitContentFilterEnabled - true to filter explicit content, false to allow
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const setExplicitContentFilter = (
  session: PandoraSession,
  isExplicitContentFilterEnabled: boolean
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.setExplicitContentFilter(session, { isExplicitContentFilterEnabled })

/**
 * Creates a new station based on a music token (artist, track, or genre).
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing musicToken to seed the new station
 * @returns Created station details
 *
 * @effect
 * - Success: CreateStationResponse - new station information including stationToken
 * - Error: ApiCallError - when the API request fails
 */
export const createStation = (
  session: PandoraSession,
  request: CreateStationRequest
): Effect.Effect<CreateStationResponse, PandoraError> =>
  Station.createStation(session, request)

/**
 * Permanently deletes a station from the user's account.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationToken of the station to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or station not found
 */
export const deleteStation = (
  session: PandoraSession,
  request: DeleteStationRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteStation(session, request)

/**
 * Renames an existing station.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param request - Request containing stationToken and new stationName
 * @returns Updated station details
 *
 * @effect
 * - Success: RenameStationResponse - renamed station information
 * - Error: ApiCallError - when the API request fails or station not found
 */
export const renameStation = (
  session: PandoraSession,
  request: RenameStationRequest
): Effect.Effect<RenameStationResponse, PandoraError> =>
  Station.renameStation(session, request)

/**
 * Retrieves the musical explanation for why a track was played on a station.
 * Shows the musical attributes that matched the station's profile.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param trackToken - Unique token identifying the track to explain
 * @returns Musical attributes explanation (e.g., "acoustic texture", "folk influences")
 *
 * @effect
 * - Success: ExplainTrackResponse - array of musical attribute explanations
 * - Error: ApiCallError - when the API request fails
 */
export const explainTrack = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<ExplainTrackResponse, PandoraError> =>
  Track.explainTrack(session, { trackToken })

/**
 * Retrieves detailed information about a specific track.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param trackToken - Unique token identifying the track
 * @returns Complete track metadata including artist, album, and duration
 *
 * @effect
 * - Success: GetTrackResponse - detailed track information
 * - Error: ApiCallError - when the API request fails or track not found
 */
export const getTrack = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<GetTrackResponse, PandoraError> =>
  Music.getTrack(session, { trackToken })

/**
 * Shares a track or artist with another user via email.
 *
 * @param session - Active Pandora session with valid authentication tokens
 * @param musicToken - Unique token identifying the music to share (track or artist)
 * @param email - Recipient email address
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails
 */
export const shareMusic = (
  session: PandoraSession,
  musicToken: string,
  email: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  Music.shareMusic(session, { musicToken, email })
