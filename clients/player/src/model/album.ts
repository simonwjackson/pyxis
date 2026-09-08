/// The album as a screen needs it.
///
/// Albums are the unit of this product, so this is the view model everything else hangs
/// from. Three independent axes meet here and none of them may be folded into another:
/// where the person filed the album (placement), whether they asked for it offline
/// (intent), and whether its bytes are here (offline bytes).

import type { RpcLibraryAlbum, RpcLibraryTrack } from "../../../../contracts/generated/pyxis"
import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { type AlbumOffline, type Availability, availabilityOf } from "./offline"

/// Where the person filed this album. Curation intent, unrelated to bytes on a device.
export type Placement = "discovery" | "collection" | "archive" | "dismissed"

/// Exhaustive by construction: a placement added to the core fails this file to compile
/// rather than silently falling through to a default.
const PLACEMENTS: Record<RpcPlacement, Placement> = {
  [RpcPlacement.Discovery]: "discovery",
  [RpcPlacement.Collection]: "collection",
  [RpcPlacement.Archive]: "archive",
  [RpcPlacement.Dismissed]: "dismissed",
}

export const readPlacement = (placement: RpcPlacement): Placement => PLACEMENTS[placement]

export interface TrackView {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly trackNumber?: number
  readonly durationMs?: number
}

export interface AlbumView {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly year?: number
  readonly artworkUrl?: string
  readonly placement: Placement
  readonly addedAt: string
  readonly trackCount: number
  /// The tracks, in order. Carried because queueing an album means sending its track ids:
  /// the core takes `queue.add` with `trackIds`, so an album that knows only how many
  /// tracks it has cannot be played. Tracklists stay demoted in the interface; this is the
  /// queueing fact, not a licence to draw them.
  readonly tracks: readonly TrackView[]
  /// Total running time, present only when every track reports one. A partial sum is a
  /// wrong number, and a wrong number is worse than no number.
  readonly durationMs?: number
  /// Undefined means the offline overview has not been read, which is not the same as this
  /// album having no bytes.
  readonly offline?: AlbumOffline
  /// Derived from `offline` at construction, so a stored flag can never contradict bytes.
  readonly availability: Availability
}

export function readTrack(track: RpcLibraryTrack): TrackView {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    ...(track.trackNumber === undefined ? {} : { trackNumber: track.trackNumber }),
    ...(track.durationMs === undefined ? {} : { durationMs: track.durationMs }),
  }
}

function totalDuration(tracks: readonly RpcLibraryTrack[]): number | undefined {
  if (tracks.length === 0) return undefined
  let total = 0
  for (const track of tracks) {
    if (track.durationMs === undefined) return undefined
    total += track.durationMs
  }
  return total
}

export function readAlbum(album: RpcLibraryAlbum, offline?: AlbumOffline): AlbumView {
  const duration = totalDuration(album.tracks)
  return {
    id: album.id,
    title: album.title,
    artist: album.artist,
    ...(album.year === undefined ? {} : { year: album.year }),
    ...(album.artworkUrl === undefined ? {} : { artworkUrl: album.artworkUrl }),
    placement: readPlacement(album.placement),
    addedAt: album.addedAt,
    trackCount: album.tracks.length,
    tracks: album.tracks.map(readTrack),
    ...(duration === undefined ? {} : { durationMs: duration }),
    ...(offline === undefined ? {} : { offline }),
    availability: availabilityOf(offline),
  }
}

/// Read a whole library snapshot against an offline index.
///
/// `offline` is optional as a whole: passing nothing means the overview has not been read,
/// and every album correctly reports `unknown` rather than `missing`.
export function readAlbums(
  albums: readonly RpcLibraryAlbum[],
  offline?: ReadonlyMap<string, AlbumOffline>,
): readonly AlbumView[] {
  return albums.map((album) => readAlbum(album, offline?.get(album.id)))
}
