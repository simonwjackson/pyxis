/**
 * @module pandora/types/api
 * Request and response types for the Pandora JSON API v5.
 * All types use readonly modifiers for immutability.
 */

// --- Partner Authentication ---

/**
 * Request payload for partner (device) authentication.
 * First step in the two-step authentication flow.
 */
export type PartnerLoginRequest = {
	/** Partner username (e.g., "android") */
	readonly username: string;
	/** Partner password (device-specific) */
	readonly password: string;
	/** Device model identifier */
	readonly deviceModel: string;
	/** API version string */
	readonly version: string;
	/** Whether to include partner URLs in response */
	readonly includeUrls: boolean;
};

/**
 * Response from partner authentication.
 * Contains encrypted syncTime that must be decrypted.
 */
export type PartnerLoginResponse = {
	/** Blowfish-encrypted sync time (must be decrypted) */
	readonly syncTime: string;
	/** Partner ID for subsequent API calls */
	readonly partnerId: string;
	/** Partner auth token for user login */
	readonly partnerAuthToken: string;
};

// --- User Authentication ---

/**
 * Request payload for user authentication.
 * Second step in the two-step authentication flow (encrypted with Blowfish).
 */
export type UserLoginRequest = {
	/** Login type discriminator */
	readonly loginType: "user";
	/** Pandora account email or username */
	readonly username: string;
	/** Pandora account password */
	readonly password: string;
	/** Partner auth token from partner login */
	readonly partnerAuthToken: string;
	/** Calculated sync time offset */
	readonly syncTime: number;
};

/**
 * Response from user authentication.
 * Contains tokens required for all subsequent authenticated API calls.
 */
export type UserLoginResponse = {
	/** Unique user identifier */
	readonly userId: string;
	/** User auth token for API calls */
	readonly userAuthToken: string;
};

// --- Station Types ---

/**
 * Pandora radio station metadata.
 * Stations can be user-created, shared, or the special QuickMix (Shuffle) station.
 */
export type Station = {
	/** Unique token for API operations (getPlaylist, etc.) */
	readonly stationToken: string;
	/** Display name of the station */
	readonly stationName: string;
	/** Numeric station identifier */
	readonly stationId: string;
	/** True if this is the QuickMix (Shuffle) station */
	readonly isQuickMix?: boolean;
	/** Station IDs included in QuickMix shuffle */
	readonly quickMixStationIds?: readonly string[];
	/** True if station was shared by another user */
	readonly isShared?: boolean;
	/** Whether user can add seeds to this station */
	readonly allowAddMusic?: boolean;
	/** Whether user can delete this station */
	readonly allowDelete?: boolean;
	/** Whether user can rename this station */
	readonly allowRename?: boolean;
};

/**
 * Response containing user's station list.
 */
export type StationListResponse = {
	/** Array of user's stations */
	readonly stations: readonly Station[];
};

// --- Station Details ---

/**
 * Request for detailed station information.
 */
export type GetStationRequest = {
	/** Station token to query */
	readonly stationToken: string;
	/** Include seeds and feedback in response */
	readonly includeExtendedAttributes?: boolean;
};

/**
 * Seed (artist or track) that influences a station's music selection.
 */
export type StationSeed = {
	/** Unique seed identifier for deletion */
	readonly seedId: string;
	/** Artist name (present for artist seeds) */
	readonly artistName?: string;
	/** Song name (present for track seeds) */
	readonly songName?: string;
	/** Music token for the seeded content */
	readonly musicToken: string;
};

/**
 * User feedback (thumbs up/down) on a track.
 */
export type StationFeedback = {
	/** Unique feedback identifier for deletion */
	readonly feedbackId: string;
	/** Track title */
	readonly songName: string;
	/** Artist name */
	readonly artistName: string;
	/** True for thumbs up, false for thumbs down */
	readonly isPositive: boolean;
	/** Timestamp when feedback was given */
	readonly dateCreated: { readonly time: number };
};

/**
 * Detailed station information including seeds and feedback.
 */
export type GetStationResponse = {
	readonly stationToken: string;
	readonly stationName: string;
	readonly stationId: string;
	/** Seeds that influence the station's music selection */
	readonly music?: {
		/** Track seeds */
		readonly songs?: readonly StationSeed[];
		/** Artist seeds */
		readonly artists?: readonly StationSeed[];
	};
	/** User feedback history */
	readonly feedback?: {
		readonly thumbsUp?: readonly StationFeedback[];
		readonly thumbsDown?: readonly StationFeedback[];
	};
};

// --- Playlist Types ---

/**
 * Audio stream quality information.
 */
export type AudioQuality = {
	/** Direct stream URL */
	readonly audioUrl: string;
	/** Bitrate string (e.g., "128", "64") */
	readonly bitrate: string;
	/** Audio encoding format (e.g., "aacplus", "mp3") */
	readonly encoding: string;
};

/**
 * Track item from a station playlist.
 * Contains metadata and audio URLs for playback.
 */
export type PlaylistItem = {
	/** Unique token identifying this track instance */
	readonly trackToken: string;
	/** Artist name */
	readonly artistName: string;
	/** Track title */
	readonly songName: string;
	/** Album name */
	readonly albumName: string;
	/** Album artwork URL */
	readonly albumArtUrl?: string;
	/** Standard quality audio URLs (32/64/64 kbps) */
	readonly audioUrlMap?: {
		readonly highQuality: AudioQuality;
		readonly mediumQuality: AudioQuality;
		readonly lowQuality: AudioQuality;
	};
	/**
	 * High-quality audio URL (128 kbps MP3) when requested via additionalAudioUrl.
	 * Can be a single string or array depending on requested formats.
	 */
	readonly additionalAudioUrl?: string | readonly string[];
};

/**
 * Request for station playlist tracks.
 */
export type PlaylistRequest = {
	/** Station token to fetch tracks from */
	readonly stationToken: string;
	/** Request additional audio format (e.g., "HTTP_128_MP3") */
	readonly additionalAudioUrl?: string;
};

/**
 * Response containing playlist tracks for playback.
 */
export type PlaylistResponse = {
	/** Array of playable track items */
	readonly items: readonly PlaylistItem[];
};

// --- API Response Wrappers ---

/**
 * Standard API response wrapper.
 * @typeParam T - Type of the result payload
 */
export type ApiResponse<T> = {
	/** Status indicator: "ok" for success, "fail" for error */
	readonly stat: "ok" | "fail";
	/** Response payload (only present when stat is "ok") */
	readonly result: T;
};

/**
 * API error response structure (when stat === "fail").
 */
export type ApiErrorResponse = {
	readonly stat: "fail";
	/** Pandora error code (e.g., 1001 = invalid auth token) */
	readonly code: number;
	/** Human-readable error message */
	readonly message: string;
};

// --- Genre Stations ---

/**
 * Pre-defined genre station from Pandora's catalog.
 */
export type GenreStation = {
	readonly stationName: string;
	readonly stationToken: string;
	readonly stationId: string;
};

/**
 * Category of genre stations (e.g., "Pop", "Rock", "Jazz").
 */
export type GenreCategory = {
	/** Category display name */
	readonly categoryName: string;
	/** Stations in this category */
	readonly stations: readonly GenreStation[];
};

/**
 * Response containing all available genre stations by category.
 */
export type GetGenreStationsResponse = {
	readonly categories: readonly GenreCategory[];
};

// --- Bookmarks ---

/**
 * Bookmarked artist.
 */
export type ArtistBookmark = {
	/** Token for deletion operations */
	readonly bookmarkToken: string;
	readonly artistName: string;
	/** Token for creating stations from this artist */
	readonly musicToken: string;
	/** Artist image URL */
	readonly artUrl?: string;
	/** Timestamp when bookmarked */
	readonly dateCreated: { readonly time: number };
};

/**
 * Bookmarked song.
 */
export type SongBookmark = {
	/** Token for deletion operations */
	readonly bookmarkToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName?: string;
	/** Token for creating stations from this song */
	readonly musicToken: string;
	/** Audio sample URL */
	readonly sampleUrl?: string;
	/** Album artwork URL */
	readonly artUrl?: string;
	/** Timestamp when bookmarked */
	readonly dateCreated: { readonly time: number };
};

/**
 * Response containing user's bookmarked artists and songs.
 */
export type GetBookmarksResponse = {
	readonly artists?: readonly ArtistBookmark[];
	readonly songs?: readonly SongBookmark[];
};

// --- User Account ---

/**
 * User account settings.
 */
export type GetSettingsResponse = {
	readonly gender?: string;
	readonly birthYear?: number;
	readonly zipCode?: string;
	/** Whether explicit content is filtered */
	readonly isExplicitContentFilterEnabled?: boolean;
	/** Whether profile is hidden from other users */
	readonly isProfilePrivate?: boolean;
	readonly emailOptIn?: boolean;
	readonly username?: string;
};

/**
 * User account usage statistics.
 */
export type GetUsageInfoResponse = {
	/** Hours listened this month */
	readonly accountMonthlyListening?: number;
	/** Monthly listening cap (free tier) */
	readonly monthlyCapHours?: number;
	/** Warning threshold percentage */
	readonly monthlyCapWarningPercent?: number;
	readonly monthlyCapWarningRepeatPercent?: number;
	/** Whether user is a paying subscriber */
	readonly isMonthlyPayer?: boolean;
	/** Whether user has hit monthly cap */
	readonly isCapped?: boolean;
	readonly listeningTimestamp?: number;
};

/**
 * Station list checksum for change detection.
 */
export type GetStationListChecksumResponse = {
	/** Hash that changes when stations are modified */
	readonly checksum: string;
};

// --- Music Search ---

/**
 * Request for searching Pandora's music catalog.
 */
export type MusicSearchRequest = {
	/** Search query text */
	readonly searchText: string;
};

/**
 * Artist search result.
 */
export type SearchArtist = {
	readonly artistName: string;
	/** Token for creating stations from this artist */
	readonly musicToken: string;
	/** Relevance score */
	readonly score: number;
};

/**
 * Song search result.
 */
export type SearchSong = {
	readonly songName: string;
	readonly artistName: string;
	/** Token for creating stations from this song */
	readonly musicToken: string;
	/** Relevance score */
	readonly score: number;
};

/**
 * Genre station search result.
 */
export type SearchGenreStation = {
	readonly stationName: string;
	/** Token for adding this station */
	readonly musicToken: string;
	/** Relevance score */
	readonly score: number;
};

/**
 * Music search results containing artists, songs, and genre stations.
 */
export type MusicSearchResponse = {
	readonly artists?: readonly SearchArtist[];
	readonly songs?: readonly SearchSong[];
	readonly genreStations?: readonly SearchGenreStation[];
};

// --- QuickMix Configuration ---

/**
 * Request to configure which stations are included in QuickMix shuffle.
 */
export type SetQuickMixRequest = {
	/** Array of station IDs to include */
	readonly quickMixStationIds: readonly string[];
};

// --- Settings Management ---

/**
 * Request to update user account settings.
 */
export type ChangeSettingsRequest = {
	readonly gender?: string;
	readonly birthYear?: number;
	readonly zipCode?: string;
	readonly isExplicitContentFilterEnabled?: boolean;
	readonly isProfilePrivate?: boolean;
	readonly emailOptIn?: boolean;
};

/**
 * Request to toggle explicit content filtering.
 */
export type SetExplicitContentFilterRequest = {
	readonly isExplicitContentFilterEnabled: boolean;
};

// --- Bookmark Operations ---

/**
 * Request to bookmark an artist from a playing track.
 */
export type AddArtistBookmarkRequest = {
	/** Track token of currently playing track */
	readonly trackToken: string;
};

/**
 * Response after bookmarking an artist.
 */
export type AddArtistBookmarkResponse = {
	/** Token for deletion */
	readonly bookmarkToken: string;
	readonly artistName: string;
	readonly musicToken: string;
	readonly dateCreated: { readonly time: number };
};

/**
 * Request to bookmark a song.
 */
export type AddSongBookmarkRequest = {
	/** Track token of the song to bookmark */
	readonly trackToken: string;
};

/**
 * Response after bookmarking a song.
 */
export type AddSongBookmarkResponse = {
	/** Token for deletion */
	readonly bookmarkToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName?: string;
	readonly musicToken: string;
	readonly sampleUrl?: string;
	readonly dateCreated: { readonly time: number };
};

/**
 * Request to delete a bookmark.
 */
export type DeleteBookmarkRequest = {
	/** Bookmark token to delete */
	readonly bookmarkToken: string;
};

// --- Station Sharing ---

/**
 * Request to share a station via email.
 */
export type ShareStationRequest = {
	readonly stationId: string;
	readonly stationToken: string;
	/** Email addresses to share with */
	readonly emails: readonly string[];
};

/**
 * Request to convert a shared station into a personal station.
 */
export type TransformSharedStationRequest = {
	readonly stationToken: string;
};

/**
 * Response after transforming a shared station.
 */
export type TransformSharedStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};

// --- Track Feedback ---

/**
 * Request to add thumbs up/down feedback on a track.
 */
export type AddFeedbackRequest = {
	readonly stationToken: string;
	readonly trackToken: string;
	/** true = thumbs up, false = thumbs down */
	readonly isPositive: boolean;
};

/**
 * Response after adding track feedback.
 */
export type AddFeedbackResponse = {
	/** Token for deleting this feedback */
	readonly feedbackId: string;
	readonly songName: string;
	readonly artistName: string;
	readonly isPositive: boolean;
	readonly dateCreated: { readonly time: number };
};

/**
 * Request to delete track feedback.
 */
export type DeleteFeedbackRequest = {
	readonly feedbackId: string;
};

/**
 * Request to temporarily hide a song from playback (30 days).
 */
export type SleepSongRequest = {
	readonly trackToken: string;
};

// --- Station Operations ---

/**
 * Request to create a new station from a music token or track.
 */
export type CreateStationRequest = {
	/** Token from search result or bookmark */
	readonly musicToken?: string;
	/** Token from a currently playing track */
	readonly trackToken?: string;
	/** Type of seed for the new station */
	readonly musicType?: "song" | "artist";
};

/**
 * Response after creating a new station.
 */
export type CreateStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};

/**
 * Request to delete a station.
 */
export type DeleteStationRequest = {
	readonly stationToken: string;
};

/**
 * Request to rename a station.
 */
export type RenameStationRequest = {
	readonly stationToken: string;
	/** New station name */
	readonly stationName: string;
};

/**
 * Response after renaming a station.
 */
export type RenameStationResponse = {
	readonly stationId: string;
	readonly stationToken: string;
	readonly stationName: string;
};

// --- Track Explanation (Music Genome) ---

/**
 * Request to get why a track was played on a station.
 */
export type ExplainTrackRequest = {
	readonly trackToken: string;
};

/**
 * Musical attribute that influenced track selection.
 */
export type TrackExplanation = {
	/** Internal trait identifier */
	readonly focusTraitId: string;
	/** Human-readable trait name (e.g., "acoustic texture") */
	readonly focusTraitName: string;
};

/**
 * Response explaining why a track was played based on Music Genome analysis.
 */
export type ExplainTrackResponse = {
	readonly explanations: readonly TrackExplanation[];
};

// --- Track Details ---

/**
 * Request for detailed track information.
 */
export type GetTrackRequest = {
	readonly trackToken: string;
};

/**
 * Detailed track metadata.
 */
export type GetTrackResponse = {
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	/** User's rating (1-5 stars) if set */
	readonly songRating?: number;
	readonly trackToken: string;
	/** Token for creating stations from this track */
	readonly musicToken?: string;
	/** Album artwork URL */
	readonly artUrl?: string;
	/** Link to song detail page on Pandora */
	readonly songDetailUrl?: string;
	/** Link to artist detail page on Pandora */
	readonly artistDetailUrl?: string;
	/** Link to album detail page on Pandora */
	readonly albumDetailUrl?: string;
};

// --- Share Music ---

/**
 * Request to share a track or artist via email.
 */
export type ShareMusicRequest = {
	readonly musicToken: string;
	readonly email: string;
};

// --- Station Seed Management ---

/**
 * Request to add a seed (artist/track) to influence a station.
 */
export type AddMusicRequest = {
	readonly stationToken: string;
	/** Music token from search result or bookmark */
	readonly musicToken: string;
};

/**
 * Response after adding a seed to a station.
 */
export type AddMusicResponse = {
	/** Seed ID for deletion */
	readonly seedId: string;
	readonly artistName?: string;
	readonly songName?: string;
};

/**
 * Request to remove a seed from a station.
 */
export type DeleteMusicRequest = {
	readonly seedId: string;
};
