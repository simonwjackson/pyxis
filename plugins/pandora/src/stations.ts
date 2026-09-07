import type { CanonicalPandoraTrack, PandoraPlaylistItem, PandoraStation } from "./types"

/// A Pandora station in the shape every source answers with.
///
/// `isQuickMix` is deliberately dropped. QuickMix is a Pandora idea, and the generic station
/// model carries only what every provider can mean. It returns when the model grows a concept
/// that holds it, not before.
export function canonicalStation(station: PandoraStation) {
  return {
    externalId: station.stationToken,
    name: station.stationName,
    ...(station.artUrl === undefined ? {} : { artworkUrl: station.artUrl }),
  }
}

export function canonicalTrack(item: PandoraPlaylistItem): CanonicalPandoraTrack | undefined {
  if (!item.trackToken || !item.songName || !item.artistName || !item.albumName) return undefined
  return {
    source: "pandora",
    externalId: item.trackToken,
    title: item.songName,
    artist: item.artistName,
    album: item.albumName,
    ...(item.albumArtUrl === undefined ? {} : { artworkUrl: item.albumArtUrl }),
  }
}

export function audioUrl(item: PandoraPlaylistItem): string | undefined {
  if (typeof item.additionalAudioUrl === "string") return item.additionalAudioUrl
  if (Array.isArray(item.additionalAudioUrl)) return item.additionalAudioUrl[0]
  return (
    item.audioUrlMap?.highQuality?.audioUrl ??
    item.audioUrlMap?.mediumQuality?.audioUrl ??
    item.audioUrlMap?.lowQuality?.audioUrl
  )
}
