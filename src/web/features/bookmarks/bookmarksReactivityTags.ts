/**
 * @module bookmarksReactivityTags
 *
 * Typed reactivity tags for the bookmarks surface. The bookmarks page
 * subscribes its `library.bookmarks.list` query atom to
 * {@link LIBRARY_BOOKMARKS_TAG}, and `library.bookmark.remove` (and any
 * future bookmark add/remove paths) publish the same tag so the page
 * refreshes in step with the legacy `utils.library.bookmarks.invalidate()`
 * call.
 */

/** Refresh tag for the `library.bookmarks.list` query. */
export const LIBRARY_BOOKMARKS_TAG = "library.bookmarks" as const;
