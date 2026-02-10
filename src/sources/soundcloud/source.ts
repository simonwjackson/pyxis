/**
 * @module soundcloud/source
 * SoundCloud source implementation for the Pyxis music player.
 * Provides search, album details, and streaming capabilities.
 */

import type {
	NormalizedRelease,
	MetadataSource,
	MetadataSearchQuery,
	ReleaseType,
	Source,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
} from "../types.js";
import { createSoundCloudClient, type SoundCloudClient } from "./client.js";
import type { Playlist, Track } from "./schemas.js";

/**
 * Maps SoundCloud set_type to canonical release type.
 *
 * @param setType - SoundCloud set_type value
 * @param isAlbum - Whether is_album flag is set
 * @returns Canonical release type
 */
const mapSetTypeToReleaseType = (
	setType: string | null | undefined,
	isAlbum: boolean | undefined,
): ReleaseType => {
	if (setType === "ep") return "ep";
	if (setType === "compilation") return "compilation";
	if (setType === "single") return "single";
	if (isAlbum) return "album";
	return "other";
};

/**
 * Converts a SoundCloud playlist to normalized release format.
 *
 * @param playlist - SoundCloud playlist object
 * @returns Normalized release object for cross-source compatibility
 */
const normalizePlaylist = (playlist: Playlist): NormalizedRelease => {
	const artistName = playlist.user?.username ?? "Unknown";
	const rawYear = playlist.created_at
		? Number.parseInt(playlist.created_at.slice(0, 4), 10)
		: null;
	const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : null;
	const artworkUrl = playlist.artwork_url;

	return {
		fingerprint: "",
		title: playlist.title,
		artists: [
			{
				name: artistName,
				ids: playlist.user ? [{ source: "soundcloud", id: String(playlist.user.id) }] : [],
			},
		],
		releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		...(year != null ? { year } : {}),
		ids: [{ source: "soundcloud", id: String(playlist.id) }],
		confidence: 1,
		genres: playlist.genre ? [playlist.genre] : [],
		...(artworkUrl != null ? { artworkUrl } : {}),
		sourceScores: { soundcloud: 100 },
	};
};

/**
 * Converts a SoundCloud track to canonical track format.
 *
 * @param track - SoundCloud track object
 * @param albumTitle - Parent album/playlist title
 * @returns Canonical track object
 */
const soundcloudTrackToCanonical = (
	track: Track,
	albumTitle: string,
): CanonicalTrack => ({
	id: String(track.id),
	title: track.title ?? "Unknown",
	artist: track.user?.username ?? "Unknown",
	album: albumTitle,
	sourceId: { source: "soundcloud", id: String(track.id) },
	// SoundCloud durations are in milliseconds, convert to seconds
	...(track.duration != null ? { duration: Math.round(track.duration / 1000) } : {}),
	...(track.artwork_url != null ? { artworkUrl: track.artwork_url } : {}),
});

/**
 * Resolves a direct stream URL from track transcoding data.
 * Fetches the progressive HTTP stream URL using the client_id.
 *
 * @param track - SoundCloud track with media transcoding data
 * @param clientId - SoundCloud client_id for URL resolution
 * @returns Direct audio stream URL
 * @throws Error if no progressive transcoding is available
 */
const resolveStreamUrl = async (track: Track, clientId: string): Promise<string> => {
	// Find a progressive (HTTP) stream URL from transcodings
	const transcoding = track.media?.transcodings?.find(
		(t) => t.format?.protocol === "progressive",
	);
	if (!transcoding) {
		throw new Error(`SoundCloud: no progressive transcoding for track ${track.id}`);
	}

	// The transcoding URL requires client_id to resolve to direct audio URL
	const streamResponse = await fetch(`${transcoding.url}?client_id=${clientId}`);
	if (!streamResponse.ok) {
		throw new Error(`SoundCloud: failed to resolve stream URL for track ${track.id}`);
	}

	const data = (await streamResponse.json()) as { url?: string };
	if (!data.url) {
		throw new Error(`SoundCloud: empty stream URL for track ${track.id}`);
	}

	return data.url;
};

/**
 * Configuration options for creating a SoundCloud source.
 * Includes application identification and rate limiting settings.
 */
export type SoundCloudSourceConfig = {
	/** Application name for User-Agent header */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact URL/email for User-Agent header */
	readonly contact: string;
	/** SoundCloud client_id (auto-extracted if not provided) */
	readonly clientId?: string;
	/** Maximum requests per second (default: 2) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 5) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * Builds a search query string from a metadata search query.
 *
 * @param input - Metadata search query (text or structured)
 * @returns Search query string for SoundCloud API
 */
const buildQuery = (input: MetadataSearchQuery): string => {
	if (input.kind === "text") return input.query;
	return `${input.artist} ${input.title}`;
};

/**
 * Combined SoundCloud source type implementing both Source and MetadataSource.
 * Provides full playback capabilities (search, albums, streaming) plus metadata search.
 */
export type SoundCloudFullSource = Source & MetadataSource;

/**
 * Builds a full SoundCloud source from an initialized client.
 *
 * @param client - Initialized SoundCloud API client
 * @returns Full SoundCloud source with all capabilities
 */
const buildFullSource = (client: SoundCloudClient): SoundCloudFullSource => {
	// --- MetadataSource capability ---

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const query = buildQuery(input);
		const playlists = await client.searchPlaylists(query, limit);
		return playlists.map(normalizePlaylist);
	};

	// --- SearchCapability ---

	const search = async (query: string): Promise<SearchResult> => {
		const playlists = await client.searchPlaylists(query, 20);

		const albums: CanonicalAlbum[] = playlists.map((playlist) => ({
			id: String(playlist.id),
			title: playlist.title,
			artist: playlist.user?.username ?? "Unknown",
			tracks: [],
			sourceIds: [{ source: "soundcloud" as const, id: String(playlist.id) }],
			...(playlist.artwork_url != null ? { artworkUrl: playlist.artwork_url } : {}),
			...(playlist.genre != null ? { genres: [playlist.genre] } : {}),
			releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		}));

		return { tracks: [], albums };
	};

	// --- AlbumCapability ---

	const getAlbumTracks = async (albumId: string) => {
		const playlist = await client.getPlaylistWithFullTracks(Number(albumId));

		const canonicalTracks: readonly CanonicalTrack[] = (playlist.tracks ?? []).map(
			(track, index) => ({
				...soundcloudTrackToCanonical(track, playlist.title),
				// Use album artwork as fallback if track has no art
				...(track.artwork_url == null && playlist.artwork_url != null
					? { artworkUrl: playlist.artwork_url }
					: {}),
				trackIndex: index,
			}),
		);

		const rawYear = playlist.created_at
			? Number.parseInt(playlist.created_at.slice(0, 4), 10)
			: null;
		const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : undefined;

		const album: CanonicalAlbum = {
			id: albumId,
			title: playlist.title,
			artist: playlist.user?.username ?? "Unknown",
			tracks: canonicalTracks,
			sourceIds: [{ source: "soundcloud", id: albumId }],
			...(year != null ? { year } : {}),
			...(playlist.artwork_url != null ? { artworkUrl: playlist.artwork_url } : {}),
			...(playlist.genre != null ? { genres: [playlist.genre] } : {}),
			releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		};

		return { album, tracks: canonicalTracks };
	};

	// --- StreamCapability ---

	const getStreamUrl = async (trackId: string): Promise<string> => {
		const clientId = client.getClientId();
		if (!clientId) {
			throw new Error("SoundCloud: client_id not available for stream resolution");
		}

		const track = await client.getTrack(Number(trackId));
		return resolveStreamUrl(track, clientId);
	};

	return {
		type: "soundcloud",
		name: "SoundCloud",
		searchReleases,
		search,
		getAlbumTracks,
		getStreamUrl,
	};
};

/**
 * Creates a full SoundCloud source with both playback and metadata capabilities.
 * Implements SearchCapability, AlbumCapability, StreamCapability, and MetadataSource.
 * If no client_id is provided, it will be auto-extracted from SoundCloud's website.
 *
 * @param config - Source configuration including app info and rate limit settings
 * @returns Promise resolving to full SoundCloud source with all capabilities
 *
 * @example
 * const source = await createSoundCloudFullSource({
 *   appName: "Pyxis",
 *   version: "1.0.0",
 *   contact: "https://github.com/user/pyxis"
 * });
 * const results = await source.search("ambient");
 * const album = await source.getAlbumTracks("12345678");
 */
export const createSoundCloudFullSource = async (
	config: SoundCloudSourceConfig,
): Promise<SoundCloudFullSource> => {
	const client = await createSoundCloudClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.clientId != null ? { clientId: config.clientId } : {}),
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	return buildFullSource(client);
};

/**
 * Creates a SoundCloud metadata-only source for release search.
 * Backwards-compatible factory that wraps createSoundCloudFullSource.
 *
 * @param config - Source configuration including app info and rate limit settings
 * @returns Promise resolving to MetadataSource with searchReleases capability
 */
export const createSoundCloudSource = async (
	config: SoundCloudSourceConfig,
): Promise<MetadataSource> => createSoundCloudFullSource(config);
