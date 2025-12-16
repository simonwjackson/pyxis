// Partner login
export type PartnerLoginRequest = {
	readonly username: string;
	readonly password: string;
	readonly deviceModel: string;
	readonly version: string;
	readonly includeUrls: boolean;
};

export type PartnerLoginResponse = {
	readonly syncTime: string; // encrypted
	readonly partnerId: string;
	readonly partnerAuthToken: string;
};

// User login
export type UserLoginRequest = {
	readonly loginType: "user";
	readonly username: string;
	readonly password: string;
	readonly partnerAuthToken: string;
	readonly syncTime: number;
};

export type UserLoginResponse = {
	readonly userId: string;
	readonly userAuthToken: string;
};

// Station list
export type Station = {
	readonly stationToken: string;
	readonly stationName: string;
	readonly stationId: string;
};

export type StationListResponse = {
	readonly stations: readonly Station[];
};

// Get station
export type GetStationRequest = {
	readonly stationToken: string;
	readonly includeExtendedAttributes?: boolean;
};

export type StationSeed = {
	readonly seedId: string;
	readonly artistName?: string;
	readonly songName?: string;
	readonly musicToken: string;
};

export type StationFeedback = {
	readonly feedbackId: string;
	readonly songName: string;
	readonly artistName: string;
	readonly isPositive: boolean;
	readonly dateCreated: { readonly time: number };
};

export type GetStationResponse = {
	readonly stationToken: string;
	readonly stationName: string;
	readonly stationId: string;
	readonly music?: {
		readonly songs?: readonly StationSeed[];
		readonly artists?: readonly StationSeed[];
	};
	readonly feedback?: {
		readonly thumbsUp?: readonly StationFeedback[];
		readonly thumbsDown?: readonly StationFeedback[];
	};
};

// Playlist
export type AudioQuality = {
	readonly audioUrl: string;
	readonly bitrate: string;
	readonly encoding: string;
};

export type PlaylistItem = {
	readonly trackToken: string;
	readonly artistName: string;
	readonly songName: string;
	readonly albumName: string;
	readonly audioUrlMap?: {
		readonly highQuality: AudioQuality;
		readonly mediumQuality: AudioQuality;
		readonly lowQuality: AudioQuality;
	};
	// additionalAudioUrl is returned when requested via PlaylistRequest.additionalAudioUrl
	// Can be a single string or array of strings depending on how many formats were requested
	readonly additionalAudioUrl?: string | readonly string[];
};

export type PlaylistRequest = {
	readonly stationToken: string;
	readonly additionalAudioUrl?: string;
};

export type PlaylistResponse = {
	readonly items: readonly PlaylistItem[];
};

// API wrapper response
export type ApiResponse<T> = {
	readonly stat: "ok" | "fail";
	readonly result: T;
};

// API error response (when stat === "fail")
export type ApiErrorResponse = {
	readonly stat: "fail";
	readonly code: number;
	readonly message: string;
};

// Genre stations
export type GenreStation = {
	readonly stationName: string;
	readonly stationToken: string;
	readonly stationId: string;
};

export type GenreCategory = {
	readonly categoryName: string;
	readonly stations: readonly GenreStation[];
};

export type GetGenreStationsResponse = {
	readonly categories: readonly GenreCategory[];
};

// Bookmarks
export type ArtistBookmark = {
	readonly bookmarkToken: string;
	readonly artistName: string;
	readonly musicToken: string;
	readonly artUrl?: string;
	readonly dateCreated: { readonly time: number };
};

export type SongBookmark = {
	readonly bookmarkToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName?: string;
	readonly musicToken: string;
	readonly sampleUrl?: string;
	readonly artUrl?: string;
	readonly dateCreated: { readonly time: number };
};

export type GetBookmarksResponse = {
	readonly artists?: readonly ArtistBookmark[];
	readonly songs?: readonly SongBookmark[];
};

// User account
export type GetSettingsResponse = {
	readonly gender?: string;
	readonly birthYear?: number;
	readonly zipCode?: string;
	readonly isExplicitContentFilterEnabled?: boolean;
	readonly isProfilePrivate?: boolean;
	readonly emailOptIn?: boolean;
	readonly username?: string;
};

export type GetUsageInfoResponse = {
	readonly accountMonthlyListening?: number;
	readonly monthlyCapHours?: number;
	readonly monthlyCapWarningPercent?: number;
	readonly monthlyCapWarningRepeatPercent?: number;
	readonly isMonthlyPayer?: boolean;
	readonly isCapped?: boolean;
	readonly listeningTimestamp?: number;
};

export type GetStationListChecksumResponse = {
	readonly checksum: string;
};

// Music search
export type MusicSearchRequest = {
	readonly searchText: string;
};

export type SearchArtist = {
	readonly artistName: string;
	readonly musicToken: string;
	readonly score: number;
};

export type SearchSong = {
	readonly songName: string;
	readonly artistName: string;
	readonly musicToken: string;
	readonly score: number;
};

export type SearchGenreStation = {
	readonly stationName: string;
	readonly musicToken: string;
	readonly score: number;
};

export type MusicSearchResponse = {
	readonly artists?: readonly SearchArtist[];
	readonly songs?: readonly SearchSong[];
	readonly genreStations?: readonly SearchGenreStation[];
};

// QuickMix
export type SetQuickMixRequest = {
	readonly quickMixStationIds: readonly string[];
};

// Change settings
export type ChangeSettingsRequest = {
	readonly gender?: string;
	readonly birthYear?: number;
	readonly zipCode?: string;
	readonly isExplicitContentFilterEnabled?: boolean;
	readonly isProfilePrivate?: boolean;
	readonly emailOptIn?: boolean;
};

// Explicit content filter
export type SetExplicitContentFilterRequest = {
	readonly isExplicitContentFilterEnabled: boolean;
};

// Bookmark operations
export type AddArtistBookmarkRequest = {
	readonly trackToken: string;
};

export type AddArtistBookmarkResponse = {
	readonly bookmarkToken: string;
	readonly artistName: string;
	readonly musicToken: string;
	readonly dateCreated: { readonly time: number };
};

export type AddSongBookmarkRequest = {
	readonly trackToken: string;
};

export type AddSongBookmarkResponse = {
	readonly bookmarkToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName?: string;
	readonly musicToken: string;
	readonly sampleUrl?: string;
	readonly dateCreated: { readonly time: number };
};

export type DeleteBookmarkRequest = {
	readonly bookmarkToken: string;
};

// Station sharing
export type ShareStationRequest = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly emails: readonly string[];
};

export type TransformSharedStationRequest = {
	readonly stationToken: string;
};

export type TransformSharedStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};
// Track feedback
export type AddFeedbackRequest = {
	readonly stationToken: string;
	readonly trackToken: string;
	readonly isPositive: boolean;
};

export type AddFeedbackResponse = {
	readonly feedbackId: string;
	readonly songName: string;
	readonly artistName: string;
	readonly isPositive: boolean;
	readonly dateCreated: { readonly time: number };
};

export type DeleteFeedbackRequest = {
	readonly feedbackId: string;
};

export type SleepSongRequest = {
	readonly trackToken: string;
};

// Station operations
export type CreateStationRequest = {
	readonly musicToken?: string;
	readonly trackToken?: string;
	readonly musicType?: "song" | "artist";
};

export type CreateStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};

export type DeleteStationRequest = {
	readonly stationToken: string;
};

export type RenameStationRequest = {
	readonly stationToken: string;
	readonly stationName: string;
};

export type RenameStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};

// Track explanation
export type ExplainTrackRequest = {
	readonly trackToken: string;
};

export type TrackExplanation = {
	readonly focusTraitId: string;
	readonly focusTraitName: string;
};

export type ExplainTrackResponse = {
	readonly explanations: readonly TrackExplanation[];
};

// Track details
export type GetTrackRequest = {
	readonly trackToken: string;
};

export type GetTrackResponse = {
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly songRating?: number;
	readonly trackToken: string;
	readonly musicToken?: string;
	readonly artUrl?: string;
	readonly songDetailUrl?: string;
	readonly artistDetailUrl?: string;
	readonly albumDetailUrl?: string;
};

// Share music
export type ShareMusicRequest = {
	readonly musicToken: string;
	readonly email: string;
};

// Station seed management
export type AddMusicRequest = {
	readonly stationToken: string;
	readonly musicToken: string;
};

export type AddMusicResponse = {
	readonly seedId: string;
	readonly artistName?: string;
	readonly songName?: string;
};

export type DeleteMusicRequest = {
	readonly seedId: string;
};
