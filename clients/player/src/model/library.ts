/// The library as one screen's worth of truth.
///
/// A deliberate absence is recorded here. The worker boundary does not expose the outbox,
/// because the queue of unsent writes belongs to sync and a second reader would invite a
/// second writer. So this client can know *how many* writes are waiting, but not which
/// albums they belong to. There is therefore no per-album "pending" flag: inventing one
/// would mean guessing, and a wrong pending badge is worse than none.

import type { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { type AlbumView, type Placement, readPlacement } from "./album"
import type { Remote } from "./edge"

/// Structural mirror of one durable sync notice from the worker's settings.
export type SyncNoticeRecord =
  | {
      readonly id: string
      readonly kind: "conflict"
      readonly albumId: string
      readonly kept: RpcPlacement | "removed"
      readonly discarded: RpcPlacement
    }
  | {
      readonly id: string
      readonly kind: "dropped"
      readonly writeId: string
      readonly reason: string
    }

/// Something that happened to the person's own intent, which they deserve to be told
/// about. Both cases mean an action they took did not end where they left it.
export type LibraryNotice =
  | {
      readonly kind: "conflict"
      readonly id: string
      readonly albumId: string
      readonly kept: Placement | "removed"
      readonly discarded: Placement
    }
  | {
      readonly kind: "dropped"
      readonly id: string
      readonly reason: string
    }

export function readNotice(notice: SyncNoticeRecord): LibraryNotice {
  if (notice.kind === "dropped") return { kind: "dropped", id: notice.id, reason: notice.reason }
  return {
    kind: "conflict",
    id: notice.id,
    albumId: notice.albumId,
    kept: notice.kept === "removed" ? "removed" : readPlacement(notice.kept),
    discarded: readPlacement(notice.discarded),
  }
}

export const readNotices = (notices: readonly SyncNoticeRecord[]): readonly LibraryNotice[] =>
  notices.map(readNotice)

export interface LibraryCounts {
  readonly all: number
  readonly downloaded: number
  readonly collection: number
  readonly discovery: number
  readonly archive: number
}

export interface LibraryView {
  readonly albums: Remote<readonly AlbumView[]>
  /// Durable outcomes the person has not been shown yet.
  readonly notices: readonly LibraryNotice[]
  /// Writes this device has made that the server has not accepted. A count only; see the
  /// note at the top of this file for why it cannot be attributed to individual albums.
  readonly pendingWrites: number
  /// False when this device cannot retain media. No offline promise may be made while
  /// this is false, whatever anyone has asked for.
  readonly offlineSupported: boolean
  readonly offlineBytes: number
}

/// Albums filed in one place. Dismissed albums are never returned by a placement query
/// they were not explicitly asked for.
export const inPlacement = (
  albums: readonly AlbumView[],
  placement: Placement,
): readonly AlbumView[] => albums.filter((album) => album.placement === placement)

/// Albums whose bytes are actually here. Asked-for-but-absent albums are excluded, which
/// is the whole point of keeping intent and bytes apart.
export const downloaded = (albums: readonly AlbumView[]): readonly AlbumView[] =>
  albums.filter((album) => album.availability === "available")

export function countLibrary(albums: readonly AlbumView[]): LibraryCounts {
  let downloadedCount = 0
  let collection = 0
  let discovery = 0
  let archive = 0
  for (const album of albums) {
    if (album.availability === "available") downloadedCount += 1
    if (album.placement === "collection") collection += 1
    if (album.placement === "discovery") discovery += 1
    if (album.placement === "archive") archive += 1
  }
  return { all: albums.length, downloaded: downloadedCount, collection, discovery, archive }
}

/// Most recently added first. Ties keep their original order, so a rebuild does not
/// reshuffle a shelf under someone's hand.
export const byRecentlyAdded = (albums: readonly AlbumView[]): readonly AlbumView[] =>
  [...albums].sort((left, right) => right.addedAt.localeCompare(left.addedAt))
