// Partner login
export type PartnerLoginRequest = {
  readonly username: string
  readonly password: string
  readonly deviceModel: string
  readonly version: string
  readonly includeUrls: boolean
}

export type PartnerLoginResponse = {
  readonly syncTime: string  // encrypted
  readonly partnerId: string
  readonly partnerAuthToken: string
}

// User login
export type UserLoginRequest = {
  readonly loginType: "user"
  readonly username: string
  readonly password: string
  readonly partnerAuthToken: string
  readonly syncTime: number
}

export type UserLoginResponse = {
  readonly userId: string
  readonly userAuthToken: string
}

// Station list
export type Station = {
  readonly stationToken: string
  readonly stationName: string
  readonly stationId: string
}

export type StationListResponse = {
  readonly stations: readonly Station[]
}

// Playlist
export type AudioQuality = {
  readonly audioUrl: string
  readonly bitrate: string
  readonly encoding: string
}

export type PlaylistItem = {
  readonly trackToken: string
  readonly artistName: string
  readonly songName: string
  readonly albumName: string
  readonly audioUrlMap?: {
    readonly highQuality: AudioQuality
    readonly mediumQuality: AudioQuality
    readonly lowQuality: AudioQuality
  }
}

export type PlaylistRequest = {
  readonly stationToken: string
  readonly additionalAudioUrl?: string
}

export type PlaylistResponse = {
  readonly items: readonly PlaylistItem[]
}

// API wrapper response
export type ApiResponse<T> = {
  readonly stat: "ok" | "fail"
  readonly result: T
}
