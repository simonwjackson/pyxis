/// The library as one screen's worth of truth.
///
/// A deliberate absence is recorded here. The worker boundary does not expose the outbox,
/// because the queue of unsent writes belongs to sync and a second reader would invite a
/// second writer. So this client can know *how many* writes are waiting, but not which
/// albums they belong to. There is therefore no per-album "pending" flag: inventing one
/// would mean guessing, and a wrong pending badge is worse than none.

import type { AlbumView } from "./album"
import type { Remote } from "./edge"

export interface SyncNoticeRecord {
  readonly id: string
  readonly kind: "dropped"
  readonly writeId: string
  readonly reason: string
}

export interface LibraryNotice {
  readonly kind: "dropped"
  readonly id: string
  readonly reason: string
}

export const readNotices = (notices: readonly SyncNoticeRecord[]): readonly LibraryNotice[] =>
  notices
    .filter((notice) => notice.kind === "dropped")
    .map(({ id, reason }) => ({ kind: "dropped", id, reason }))

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
