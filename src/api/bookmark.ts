import { Effect } from "effect"
import { callPandoraMethod } from "./call.js"
import type {
  AddArtistBookmarkRequest,
  AddArtistBookmarkResponse,
  AddSongBookmarkRequest,
  AddSongBookmarkResponse,
  DeleteBookmarkRequest
} from "../types/api.js"
import type { ApiCallError } from "../types/errors.js"

type AuthState = {
  readonly syncTime: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userAuthToken: string
  readonly userId: string
}

export const addArtistBookmark = (
  state: AuthState,
  request: AddArtistBookmarkRequest
): Effect.Effect<AddArtistBookmarkResponse, ApiCallError> =>
  callPandoraMethod<AddArtistBookmarkResponse>(
    state,
    "bookmark.addArtistBookmark",
    request,
    { encrypted: true }
  )

export const addSongBookmark = (
  state: AuthState,
  request: AddSongBookmarkRequest
): Effect.Effect<AddSongBookmarkResponse, ApiCallError> =>
  callPandoraMethod<AddSongBookmarkResponse>(
    state,
    "bookmark.addSongBookmark",
    request,
    { encrypted: true }
  )

export const deleteArtistBookmark = (
  state: AuthState,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "bookmark.deleteArtistBookmark",
    request,
    { encrypted: true }
  )

export const deleteSongBookmark = (
  state: AuthState,
  request: DeleteBookmarkRequest
): Effect.Effect<Record<string, never>, ApiCallError> =>
  callPandoraMethod<Record<string, never>>(
    state,
    "bookmark.deleteSongBookmark",
    request,
    { encrypted: true }
  )
