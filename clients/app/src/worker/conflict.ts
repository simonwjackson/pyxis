/// Merge rules for two-way domains.
///
/// Pure on purpose. Every rule here is a decision somebody could disagree with, so it must
/// be readable and testable without a network, a database, or a worker.
///
/// The rule for album placement is per-record revision plus device identity, with an
/// explicit conflict outcome. A conflict is never resolved silently: the caller is told
/// what it kept and what it discarded, so a client can say so.

import type { RpcPlacement } from "../../../../contracts/generated/pyxis"

export interface LocalPlacementWrite {
  readonly albumId: string
  readonly placement: RpcPlacement
  /// The revision this change was made on top of.
  readonly baseRevision: number
  /// What the placement was before the local change.
  readonly basePlacement: RpcPlacement
  /// When the person made the change on this device.
  readonly queuedAt: string
  readonly deviceId: string
}

export interface RemotePlacement {
  readonly placement: RpcPlacement
  readonly revision: number
  readonly placementUpdatedAt: string
  /// Which device last changed it on the server. Used only to break an exact timestamp
  /// tie, so that two devices resolve the same way instead of ping-ponging.
  readonly deviceId?: string
}

export type PlacementDecision =
  /// Send the local change. The server has not moved underneath it.
  | { readonly action: "push"; readonly conflict: false }
  /// The server already agrees. A replay of a write that already landed, which is what
  /// makes draining the queue twice harmless.
  | { readonly action: "converged"; readonly conflict: false }
  /// Both sides changed. Local intent is newer, so it still goes, and the caller is told.
  | {
      readonly action: "push"
      readonly conflict: true
      readonly discarded: RpcPlacement
    }
  /// Both sides changed and the remote change is newer. Local intent is dropped, and the
  /// caller is told what was lost.
  | {
      readonly action: "keepRemote"
      readonly conflict: true
      readonly discarded: RpcPlacement
    }
  /// Another device removed the album. A placement cannot recreate it, so removal wins
  /// and the caller is told which local intent was discarded.
  | {
      readonly action: "remove"
      readonly conflict: true
      readonly discarded: RpcPlacement
    }

/// Decide what to do with one queued placement write.
///
/// `remote` is absent when the album is gone from the server. Nothing can be pushed onto a
/// record that no longer exists, so server removal wins and is reported as a conflict.
export function resolvePlacement(
  local: LocalPlacementWrite,
  remote: RemotePlacement | undefined,
): PlacementDecision {
  if (remote === undefined) {
    return { action: "remove", conflict: true, discarded: local.placement }
  }

  // The server already holds what this write wanted. True both for a replay of a write
  // that landed, and for two devices that happened to agree.
  if (remote.placement === local.placement) return { action: "converged", conflict: false }

  // Nobody else touched the record since this change was made, so there is no conflict to
  // resolve. A higher revision with an unchanged placement means some other field moved.
  if (remote.revision === local.baseRevision || remote.placement === local.basePlacement) {
    return { action: "push", conflict: false }
  }

  // Both sides moved the same album to different places. The later human action wins.
  //
  // This trusts two clocks that can disagree. The alternative, asking the person to
  // resolve every conflict, is worse for a library where the stakes are which shelf an
  // album sits on. Device identity breaks an exact tie so both devices reach the same
  // answer instead of overwriting each other forever.
  const localIsNewer =
    local.queuedAt > remote.placementUpdatedAt ||
    (local.queuedAt === remote.placementUpdatedAt && local.deviceId > (remote.deviceId ?? ""))

  return localIsNewer
    ? { action: "push", conflict: true, discarded: remote.placement }
    : { action: "keepRemote", conflict: true, discarded: local.placement }
}

/// Server-to-client domains follow a revision gate: the server wins, but only when it is
/// actually newer. An older snapshot arriving late must not undo a local write.
export function acceptsRemoteRevision(localRevision: number, remoteRevision: number): boolean {
  return remoteRevision > localRevision
}
