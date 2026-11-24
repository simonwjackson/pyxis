/// The album as a screen needs it.
///
/// Albums are the unit of this product, so this is the view model everything else hangs
/// from. Offline intent stays separate from whether its bytes are here.

import type { RpcLibraryAlbum, RpcLibraryTrack } from "../../../../contracts/generated/pyxis"
import { type AlbumOffline, type Availability, availabilityOf } from "./offline"

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
