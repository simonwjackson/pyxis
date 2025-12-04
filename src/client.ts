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

export type PandoraSession = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userId: string
  readonly userAuthToken: string
}

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

export const getStationList = (
  session: PandoraSession
): Effect.Effect<StationListResponse, PandoraError> =>
  User.getStationList(session)

export const getPlaylist = (
  session: PandoraSession,
  request: PlaylistRequest
): Effect.Effect<PlaylistResponse, PandoraError> =>
  Station.getPlaylist(session, request)

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

export const getGenreStations = (
  session: PandoraSession
): Effect.Effect<GetGenreStationsResponse, PandoraError> =>
  Station.getGenreStations(session)

export const search = (
  session: PandoraSession,
  searchText: string
): Effect.Effect<MusicSearchResponse, PandoraError> =>
  Music.search(session, { searchText })

export const getBookmarks = (
  session: PandoraSession
): Effect.Effect<GetBookmarksResponse, PandoraError> =>
  User.getBookmarks(session)

export const getSettings = (
  session: PandoraSession
): Effect.Effect<GetSettingsResponse, PandoraError> =>
  User.getSettings(session)

export const getUsageInfo = (
  session: PandoraSession
): Effect.Effect<GetUsageInfoResponse, PandoraError> =>
  User.getUsageInfo(session)

export const getStationListChecksum = (
  session: PandoraSession
): Effect.Effect<GetStationListChecksumResponse, PandoraError> =>
  User.getStationListChecksum(session)

export const getStation = (
  session: PandoraSession,
  request: GetStationRequest
): Effect.Effect<GetStationResponse, PandoraError> =>
  Station.getStation(session, request)

export const addFeedback = (
  session: PandoraSession,
  stationToken: string,
  trackToken: string,
  isPositive: boolean
): Effect.Effect<AddFeedbackResponse, PandoraError> =>
  Station.addFeedback(session, { stationToken, trackToken, isPositive })

export const deleteFeedback = (
  session: PandoraSession,
  feedbackId: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteFeedback(session, { feedbackId })

export const sleepSong = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.sleepSong(session, { trackToken })

export const addMusic = (
  session: PandoraSession,
  request: AddMusicRequest
): Effect.Effect<AddMusicResponse, PandoraError> =>
  Station.addMusic(session, request)

export const deleteMusic = (
  session: PandoraSession,
  request: DeleteMusicRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteMusic(session, request)

export const addArtistBookmark = (
  session: PandoraSession,
  request: AddArtistBookmarkRequest
): Effect.Effect<AddArtistBookmarkResponse, PandoraError> =>
  Bookmark.addArtistBookmark(session, request)

export const addSongBookmark = (
  session: PandoraSession,
  request: AddSongBookmarkRequest
): Effect.Effect<AddSongBookmarkResponse, PandoraError> =>
  Bookmark.addSongBookmark(session, request)

export const deleteArtistBookmark = (
  session: PandoraSession,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Bookmark.deleteArtistBookmark(session, request)

export const deleteSongBookmark = (
  session: PandoraSession,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Bookmark.deleteSongBookmark(session, request)

export const shareStation = (
  session: PandoraSession,
  request: ShareStationRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.shareStation(session, request)

export const transformSharedStation = (
  session: PandoraSession,
  request: TransformSharedStationRequest
): Effect.Effect<TransformSharedStationResponse, PandoraError> =>
  Station.transformSharedStation(session, request)

export const setQuickMix = (
  session: PandoraSession,
  quickMixStationIds: readonly string[]
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.setQuickMix(session, { quickMixStationIds })

export const changeSettings = (
  session: PandoraSession,
  settings: ChangeSettingsRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.changeSettings(session, settings)

export const setExplicitContentFilter = (
  session: PandoraSession,
  isExplicitContentFilterEnabled: boolean
): Effect.Effect<Record<string, never>, PandoraError> =>
  User.setExplicitContentFilter(session, { isExplicitContentFilterEnabled })

export const createStation = (
  session: PandoraSession,
  request: CreateStationRequest
): Effect.Effect<CreateStationResponse, PandoraError> =>
  Station.createStation(session, request)

export const deleteStation = (
  session: PandoraSession,
  request: DeleteStationRequest
): Effect.Effect<Record<string, never>, PandoraError> =>
  Station.deleteStation(session, request)

export const renameStation = (
  session: PandoraSession,
  request: RenameStationRequest
): Effect.Effect<RenameStationResponse, PandoraError> =>
  Station.renameStation(session, request)

export const explainTrack = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<ExplainTrackResponse, PandoraError> =>
  Track.explainTrack(session, { trackToken })

export const getTrack = (
  session: PandoraSession,
  trackToken: string
): Effect.Effect<GetTrackResponse, PandoraError> =>
  Music.getTrack(session, { trackToken })

export const shareMusic = (
  session: PandoraSession,
  musicToken: string,
  email: string
): Effect.Effect<Record<string, never>, PandoraError> =>
  Music.shareMusic(session, { musicToken, email })
