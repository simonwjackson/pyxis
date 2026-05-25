/**
 * @module libraryReactivityTags
 *
 * Typed reactivity tags for the home shelves and any other surface that
 * reads library album lists, hot albums, or playlists. The home page binds
 * each shelf's query atom to these tags; future mutations
 * (`library.album.save`, `library.albumPlacement.set`, `library.album.remove`,
 * `playlist.radio.create`, …) publish the matching tag so the shelves
 * refresh in step with their legacy React Query invalidations
 * (`utils.library.albums.invalidate()`, `utils.library.hotAlbums.invalidate()`,
 * `utils.playlist.list.invalidate()`).
 */

/** Refresh tag for any `library.albums.list` variant (all placements). */
export const LIBRARY_ALBUMS_TAG = "library.albums" as const;

/** Refresh tag for the `library.hotAlbums.list` query. */
export const LIBRARY_HOT_ALBUMS_TAG = "library.hotAlbums" as const;

/** Refresh tag for the `playlist.list` query. */
export const PLAYLIST_LIST_TAG = "playlist.list" as const;
