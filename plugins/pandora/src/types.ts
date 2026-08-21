export interface PandoraConfig {
  readonly username: string
  readonly password: string
}

export interface PandoraSession {
  readonly syncOffset: number
  readonly partnerId: string
  readonly partnerAuthToken: string
  readonly userId: string
  readonly userAuthToken: string
}

export interface PandoraStation {
  readonly stationToken: string
  readonly stationName: string
  readonly stationId: string
  readonly isQuickMix?: boolean
}

export interface PandoraPlaylistItem {
  readonly trackToken: string
  readonly artistName: string
  readonly songName: string
  readonly albumName: string
  readonly albumArtUrl?: string
  readonly audioUrlMap?: Readonly<
    Record<
      string,
      { readonly audioUrl?: string; readonly bitrate?: string; readonly encoding?: string }
    >
  >
  readonly additionalAudioUrl?: string | readonly string[]
}

export interface CanonicalPandoraTrack {
  readonly source: "pandora"
  readonly externalId: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly artworkUrl?: string
}
