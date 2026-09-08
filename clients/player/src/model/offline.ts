/// Wanting media offline, and actually having its bytes.
///
/// These are two different facts and this module refuses to merge them. Intent is a
/// durable wish the person expressed; bytes are a measurable property of this device right
/// now. A pinned album on a device with no room is *wanted and absent*, and the screen has
/// to be able to say exactly that. Every bug in this area comes from one boolean standing
/// in for both.

/// Structural mirror of the worker's per-album offline status. Not imported, so the model
/// stays free of the worker; the binding assigns the real value and TypeScript checks it.
export interface OfflineStatusRecord {
  readonly albumId: string
  readonly state: "not-pinned" | "downloading" | "ready" | "failed"
  readonly totalTracks: number
  readonly readyTracks: number
  readonly bytes: number
  readonly error?: string
}

export interface OfflineOverviewRecord {
  readonly available: boolean
  readonly albums: readonly OfflineStatusRecord[]
  readonly totalBytes: number
}

/// What the person asked for. Survives restarts, network loss and eviction.
export type OfflineIntent = "not-requested" | "requested"

/// What is on this device, counted in tracks and bytes. Never inferred from intent.
///
/// `partial` is a first-class case rather than a percentage, because "3 of 11 tracks" and
/// "downloading" are different things to show and only one of them is a promise.
export type OfflineBytes =
  | { readonly kind: "none" }
  | {
      readonly kind: "partial"
      readonly readyTracks: number
      readonly totalTracks: number
      readonly bytes: number
    }
  | { readonly kind: "complete"; readonly tracks: number; readonly bytes: number }

/// The offline facts for one album, with intent and bytes kept apart.
export interface AlbumOffline {
  readonly intent: OfflineIntent
  readonly bytes: OfflineBytes
  /// Set when the last attempt to fetch bytes failed. Intent is unchanged by a failure.
  readonly failure?: string
  /// False when this device cannot retain media at all. Intent may still be recorded, but
  /// no promise of availability may be made while this is false.
  readonly supported: boolean
}

/// The vocabulary the cover components already speak.
export type Availability = "unknown" | "missing" | "downloading" | "available"

export function readOfflineStatus(
  status: OfflineStatusRecord | undefined,
  supported: boolean,
): AlbumOffline {
  if (status === undefined) return { intent: "not-requested", bytes: { kind: "none" }, supported }
  const intent: OfflineIntent = status.state === "not-pinned" ? "not-requested" : "requested"
  const base = { intent, supported }
  const withFailure = status.error === undefined ? base : { ...base, failure: status.error }
  if (status.readyTracks <= 0) return { ...withFailure, bytes: { kind: "none" } }
  if (status.totalTracks > 0 && status.readyTracks >= status.totalTracks)
    return {
      ...withFailure,
      bytes: { kind: "complete", tracks: status.readyTracks, bytes: status.bytes },
    }
  return {
    ...withFailure,
    bytes: {
      kind: "partial",
      readyTracks: status.readyTracks,
      totalTracks: status.totalTracks,
      bytes: status.bytes,
    },
  }
}

/// Index an overview for lookup. Absent means the overview has not been read yet, which is
/// not the same as an album being absent from it.
export function readOfflineOverview(
  overview: OfflineOverviewRecord,
): ReadonlyMap<string, AlbumOffline> {
  return new Map(
    overview.albums.map((status) => [
      status.albumId,
      readOfflineStatus(status, overview.available),
    ]),
  )
}

/// Derive what a cover may claim.
///
/// Derived on read rather than stored, so a stale flag can never contradict the bytes.
/// `undefined` means the offline overview has not been read yet: the honest answer is that
/// we do not know, not that the album is missing.
export function availabilityOf(offline: AlbumOffline | undefined): Availability {
  if (offline === undefined) return "unknown"
  // A device that cannot retain media must never show a downloaded mark, whatever the
  // intent says. Claiming otherwise strands someone who acted on the promise.
  if (!offline.supported) return "unknown"
  if (offline.bytes.kind === "complete") return "available"
  if (offline.failure !== undefined) return "missing"
  if (offline.intent === "requested") return "downloading"
  return "missing"
}

/// True when the person asked for this album offline but the bytes are not all here. The
/// one question a "downloading" indicator is actually answering.
export const isAwaitingBytes = (offline: AlbumOffline): boolean =>
  offline.intent === "requested" &&
  offline.bytes.kind !== "complete" &&
  offline.failure === undefined

/// Tracks present out of tracks wanted, for a progress reading. Returns undefined when
/// nothing was requested, so a screen cannot render 0% for an album nobody asked for.
export function offlineProgress(
  offline: AlbumOffline,
): { readonly ready: number; readonly total: number } | undefined {
  if (offline.intent !== "requested") return undefined
  if (offline.bytes.kind === "complete")
    return { ready: offline.bytes.tracks, total: offline.bytes.tracks }
  if (offline.bytes.kind === "partial")
    return { ready: offline.bytes.readyTracks, total: offline.bytes.totalTracks }
  return undefined
}
