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
 * `utils.playlist.list.invalidate()`,
 * `utils.library.resolveAlbumStates.invalidate()`).
 */

/** Refresh tag for any `library.albums.list` variant (all placements). */
export const LIBRARY_ALBUMS_TAG = "library.albums" as const;

/** Refresh tag for the `library.hotAlbums.list` query. */
export const LIBRARY_HOT_ALBUMS_TAG = "library.hotAlbums" as const;

/** Refresh tag for the `playlist.list` query. */
export const PLAYLIST_LIST_TAG = "library.playlists.list" as const;

/**
 * Refresh tag for the `library.albumStates.resolve` query. The search page
 * and source album detail bind their state queries to this tag so a
 * `library.album.save` mutation (or any mutation that changes the
 * source-id -> library-album mapping) refreshes the badge/placement
 * indicators in step with the legacy `utils.library.resolveAlbumStates`
 * invalidation.
 */
export const LIBRARY_ALBUM_STATES_TAG = "library.albumStates" as const;

/**
 * Refresh tag for a single `library.album.get` read. The `id` is the same
 * library-album identifier passed to `library.album.get`. Album detail
 * mutations (save/place/update) publish this tag so the detail query atom
 * refreshes in step with the legacy `utils.library.album.invalidate({ id })`.
 */
export function libraryAlbumTag(id: string): string {
  return `library.album:${id}`;
}

/**
 * Refresh tag for a single `library.albumTracks.list` read. The `albumId`
 * is the same library-album identifier passed to `library.albumTracks.list`.
 * Track-edit mutations publish this tag so the track list refreshes in step
 * with the legacy `utils.library.albumTracks.invalidate({ albumId })`.
 */
export function libraryAlbumTracksTag(albumId: string): string {
  return `library.albumTracks:${albumId}`;
}
