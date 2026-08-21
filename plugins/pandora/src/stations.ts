import type { CanonicalPandoraTrack, PandoraPlaylistItem, PandoraStation } from "./types"

export function canonicalStation(station: PandoraStation) {
  return {
    id: station.stationToken,
    name: station.stationName,
    quickMix: station.isQuickMix ?? false,
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
