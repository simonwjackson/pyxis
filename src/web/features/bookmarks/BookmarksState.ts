/**
 * @module BookmarksState
 *
 * Pure domain ADT for the bookmarks page. Converts the
 * `library.bookmarks.list` AsyncResult into a closed tagged union so the
 * page composes state-specific surfaces rather than branching on raw
 * runtime fields.
 *
 * Projection narrows the wire {@link ApiPandoraBookmark} into compact
 * `BookmarkArtist` and `BookmarkSong` view shapes the page rows render,
 * dropping entries that are missing the identifiers the legacy UI
 * required (`bookmarkToken`, `musicToken`, and the displayed name).
 * `Empty` is a separate case so the page can show the "no bookmarks"
 * placeholder without sprinkling array-length checks through JSX.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type {
	ApiBookmarksResponse,
	ApiPandoraBookmark,
} from "../../../api/contracts/library.js";

export type BookmarkArtist = {
	readonly bookmarkToken: string;
	readonly musicToken: string;
	readonly artistName: string;
};

export type BookmarkSong = {
	readonly bookmarkToken: string;
	readonly musicToken: string;
	readonly artistName: string;
	readonly songName: string;
};

export type BookmarksState =
	| { readonly _tag: "Loading" }
	| { readonly _tag: "Empty" }
	| {
			readonly _tag: "Ready";
			readonly artists: readonly BookmarkArtist[];
			readonly songs: readonly BookmarkSong[];
	  }
	| { readonly _tag: "LoadError"; readonly error: ApiPublicError }
	| { readonly _tag: "Defect"; readonly defect: unknown };

export const BookmarksState = {
	fromResult(
		result: AsyncResult.AsyncResult<ApiBookmarksResponse, ApiPublicError>,
	): BookmarksState {
		return AsyncResult.matchWithWaiting(result, {
			onWaiting: (): BookmarksState => ({ _tag: "Loading" }),
			onError: (error): BookmarksState => ({ _tag: "LoadError", error }),
			onDefect: (defect): BookmarksState => ({ _tag: "Defect", defect }),
			onSuccess: (success): BookmarksState => {
				const artists = projectArtists(success.value.artists ?? []);
				const songs = projectSongs(success.value.songs ?? []);
				if (artists.length === 0 && songs.length === 0) {
					return { _tag: "Empty" };
				}
				return { _tag: "Ready", artists, songs };
			},
		});
	},
};

function projectArtists(
	bookmarks: readonly ApiPandoraBookmark[],
): readonly BookmarkArtist[] {
	const artists: BookmarkArtist[] = [];
	for (const bookmark of bookmarks) {
		const musicToken = bookmark.musicToken;
		const artistName = bookmark.artistName;
		if (musicToken === undefined || artistName === undefined) continue;
		artists.push({
			bookmarkToken: bookmark.bookmarkToken,
			musicToken,
			artistName,
		});
	}
	return artists;
}

function projectSongs(
	bookmarks: readonly ApiPandoraBookmark[],
): readonly BookmarkSong[] {
	const songs: BookmarkSong[] = [];
	for (const bookmark of bookmarks) {
		const musicToken = bookmark.musicToken;
		const artistName = bookmark.artistName;
		const songName = bookmark.songName;
		if (
			musicToken === undefined ||
			artistName === undefined ||
			songName === undefined
		)
			continue;
		songs.push({
			bookmarkToken: bookmark.bookmarkToken,
			musicToken,
			artistName,
			songName,
		});
	}
	return songs;
}
