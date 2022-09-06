import { Effect } from "effect"
import * as Auth from "./api/auth.js"
import * as User from "./api/user.js"
import * as Station from "./api/station.js"
import type {
  StationListResponse,
  PlaylistRequest,
  PlaylistResponse
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
