/**
 * @module @app/web/shared/commands/trackCommandAtoms
 *
 * Shared Effect mutation atoms for the small set of track-scoped commands
 * (`track.feedback.add`, `track.sleep.set`, `library.bookmark.add`) that
 * fire from multiple surfaces — the command palette and the global
 * keyboard-shortcut handler today, and future shelves once they migrate
 * off React Query.
 *
 * Each consumer owns its own toast copy and decides whether to chain a
 * skip after the mutation. This module exposes only the mutation atoms so
 * the wire boundary stays single-sourced through {@link PyxisRpcClient}.
 *
 * These commands do not currently invalidate any reactivity tags — the
 * legacy tRPC consumers did not invalidate React Query caches either —
 * so no reactivity-key constants are exported. Add them here if a future
 * slice needs them.
 */

import { PyxisRpcClient } from "../api/rpcClient.js";

/**
 * Submit positive/negative feedback for a radio track.
 * Payload: `{ id: trackToken, radioId: stationToken, positive: boolean }`.
 */
export const trackFeedbackAddMutationAtom =
	PyxisRpcClient.mutation("track.feedback.add");

/**
 * Tell Pandora to skip a track for 30 days. Payload: `{ id: trackToken }`.
 */
export const trackSleepSetMutationAtom =
	PyxisRpcClient.mutation("track.sleep.set");

/**
 * Bookmark the currently playing song (or artist) in the user's library.
 * Payload: `{ id: trackToken, type: "song" | "artist" }`.
 */
export const libraryBookmarkAddMutationAtom = PyxisRpcClient.mutation(
	"library.bookmark.add",
);
