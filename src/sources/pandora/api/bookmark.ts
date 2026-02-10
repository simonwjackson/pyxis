/**
 * @module pandora/api/bookmark
 * Bookmark management API for Pandora.
 * Provides functions to add/remove artist and song bookmarks.
 */
import { Effect } from "effect";
import { callPandoraMethod } from "./call.js";
import type {
	AddArtistBookmarkRequest,
	AddArtistBookmarkResponse,
	AddSongBookmarkRequest,
	AddSongBookmarkResponse,
	DeleteBookmarkRequest,
} from "../types/api.js";
import type { ApiCallError } from "../types/errors.js";

/**
 * Authentication state required for authenticated Pandora API calls.
 */
type AuthState = {
	/** Time offset between client and Pandora server (seconds) */
	readonly syncTime: number;
	/** Unique identifier for the partner (device type) */
	readonly partnerId: string;
	/** Authentication token for partner-level operations */
	readonly partnerAuthToken: string;
	/** Authentication token for user-level operations */
	readonly userAuthToken: string;
	/** Unique identifier for the authenticated user */
	readonly userId: string;
};

/**
 * Bookmarks an artist for the user.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing trackToken of a track by the artist to bookmark
 * @returns Bookmark confirmation with bookmarkToken
 *
 * @effect
 * - Success: AddArtistBookmarkResponse - bookmark details including bookmarkToken
 * - Error: ApiCallError - when the API request fails
 */
export const addArtistBookmark = (
	state: AuthState,
	request: AddArtistBookmarkRequest,
): Effect.Effect<AddArtistBookmarkResponse, ApiCallError> =>
	callPandoraMethod<AddArtistBookmarkResponse>(
		state,
		"bookmark.addArtistBookmark",
		request,
		{ encrypted: true },
	);

/**
 * Bookmarks a song for the user.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing trackToken of the song to bookmark
 * @returns Bookmark confirmation with bookmarkToken
 *
 * @effect
 * - Success: AddSongBookmarkResponse - bookmark details including bookmarkToken
 * - Error: ApiCallError - when the API request fails
 */
export const addSongBookmark = (
	state: AuthState,
	request: AddSongBookmarkRequest,
): Effect.Effect<AddSongBookmarkResponse, ApiCallError> =>
	callPandoraMethod<AddSongBookmarkResponse>(
		state,
		"bookmark.addSongBookmark",
		request,
		{ encrypted: true },
	);

/**
 * Removes an artist bookmark.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing bookmarkToken to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or bookmark not found
 */
export const deleteArtistBookmark = (
	state: AuthState,
	request: DeleteBookmarkRequest,
): Effect.Effect<Record<string, never>, ApiCallError> =>
	callPandoraMethod<Record<string, never>>(
		state,
		"bookmark.deleteArtistBookmark",
		request,
		{ encrypted: true },
	);

/**
 * Removes a song bookmark.
 *
 * @param state - Authenticated session state with valid tokens
 * @param request - Request containing bookmarkToken to delete
 * @returns Empty object on success
 *
 * @effect
 * - Success: Record<string, never> - empty object indicating success
 * - Error: ApiCallError - when the API request fails or bookmark not found
 */
export const deleteSongBookmark = (
	state: AuthState,
	request: DeleteBookmarkRequest,
): Effect.Effect<Record<string, never>, ApiCallError> =>
	callPandoraMethod<Record<string, never>>(
		state,
		"bookmark.deleteSongBookmark",
		request,
		{ encrypted: true },
	);
