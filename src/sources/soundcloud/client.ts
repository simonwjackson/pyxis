/**
 * @module soundcloud/client
 * SoundCloud API client with rate limiting and retry logic.
 * Uses the unofficial api-v2.soundcloud.com endpoints.
 * Client ID is auto-extracted from SoundCloud's JS bundles if not provided.
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	PlaylistSchema,
	PlaylistSearchResultSchema,
	TrackSchema,
	type Playlist,
	type Track,
} from "./schemas.js";

/**
 * Configuration options for creating a SoundCloud API client.
 * Includes application identification and rate limiting settings.
 */
export type SoundCloudClientConfig = {
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
 * SoundCloud API client interface.
 * Provides methods for searching playlists, fetching tracks, and getting stream URLs.
 */
export type SoundCloudClient = {
	/**
	 * Searches SoundCloud for playlists/albums.
	 * @param query - Search query string
	 * @param limit - Maximum number of results (default: 20)
	 * @returns Array of matching playlists
	 */
	readonly searchPlaylists: (
		query: string,
		limit?: number,
	) => Promise<readonly Playlist[]>;
	/**
	 * Fetches track details by ID.
	 * @param trackId - SoundCloud track ID
	 * @returns Full track details with transcoding URLs
	 */
	readonly getTrack: (trackId: number) => Promise<Track>;
	/**
	 * Fetches playlist details by ID.
	 * @param playlistId - SoundCloud playlist ID
	 * @returns Playlist with track stubs (may need full track fetch)
	 */
	readonly getPlaylist: (playlistId: number) => Promise<Playlist>;
	/**
	 * Fetches playlist with fully-resolved track details.
	 * Automatically fetches full info for stub tracks (duration=30000).
	 * @param playlistId - SoundCloud playlist ID
	 * @returns Playlist with complete track information
	 */
	readonly getPlaylistWithFullTracks: (playlistId: number) => Promise<Playlist>;
	/**
	 * Returns the current client_id being used.
	 * @returns Client ID string or null if not available
	 */
	readonly getClientId: () => string | null;
	/**
	 * Returns current rate limiter statistics.
	 * @returns Stats including requests made, tokens available, etc.
	 */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Extracts the client_id from SoundCloud's JavaScript bundles.
 * Fetches the homepage and parses JS files to find the embedded client_id.
 *
 * @returns Extracted client_id string
 * @throws Error if client_id cannot be found in any JS bundle
 */
const extractClientId = async (): Promise<string> => {
	const homepage = await fetch("https://soundcloud.com").then((r) => r.text());

	const jsUrls =
		homepage.match(
			/https:\/\/a-v2\.sndcdn\.com\/assets\/[0-9]+-[a-f0-9]+\.js/g,
		) ?? [];

	for (const url of jsUrls.slice(0, 15)) {
		const js = await fetch(url).then((r) => r.text());
		const match = js.match(/client_id:"([a-zA-Z0-9]+)"/);
		if (match?.[1]) {
			return match[1];
		}
	}

	throw new Error("Could not extract SoundCloud client_id from JS bundles");
};

/**
 * Creates a SoundCloud API client with rate limiting and retry logic.
 * Uses SoundCloud's unofficial V2 API endpoints.
 * If no client_id is provided, it will be auto-extracted from SoundCloud's website.
 *
 * @param config - Client configuration including app info and rate limit settings
 * @returns Promise resolving to SoundCloud API client
 *
 * @example
 * const client = await createSoundCloudClient({
 *   appName: "MyApp",
 *   version: "1.0.0",
 *   contact: "https://myapp.example.com"
 * });
 * const playlists = await client.searchPlaylists("ambient");
 */
export const createSoundCloudClient = async (
	config: SoundCloudClientConfig,
): Promise<SoundCloudClient> => {
	const {
		appName,
		version,
		contact,
		clientId: providedClientId,
		requestsPerSecond = 2,
		burstSize = 5,
		maxRetries = 3,
	} = config;

	const clientId = providedClientId ?? (await extractClientId());

	const baseUrl = "https://api-v2.soundcloud.com";
	const userAgent = `${appName}/${version} (${contact})`;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async (
		endpoint: string,
		params: Record<string, string | number> = {},
		retryCount = 0,
	): Promise<unknown> => {
		await rateLimiter.acquire();

		const searchParams = new URLSearchParams({
			client_id: clientId,
			...Object.fromEntries(
				Object.entries(params).map(([k, v]) => [k, String(v)]),
			),
		});

		const url = `${baseUrl}${endpoint}?${searchParams}`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": userAgent,
				Accept: "application/json",
			},
		});

		if (response.status === 429) {
			if (retryCount >= maxRetries) {
				throw new Error(`SoundCloud rate limited after ${maxRetries} retries`);
			}

			rateLimiter.onRateLimited();
			const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, params, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`SoundCloud API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json() as Promise<unknown>;
	};

	return {
		searchPlaylists: async (query: string, limit = 20) => {
			const data = await request("/search/albums", { q: query, limit });
			const result = PlaylistSearchResultSchema.parse(data);
			return result.collection;
		},

		getTrack: async (trackId: number) => {
			const data = await request(`/tracks/${trackId}`);
			return TrackSchema.parse(data);
		},

		getPlaylist: async (playlistId: number) => {
			const data = await request(`/playlists/${playlistId}`);
			return PlaylistSchema.parse(data);
		},

		getPlaylistWithFullTracks: async (playlistId: number) => {
			const data = await request(`/playlists/${playlistId}`);
			const parsed = PlaylistSchema.parse(data);

			// Fetch full track details for tracks missing info (duration=30000 indicates stub)
			if (parsed.tracks && parsed.tracks.length > 0) {
				const fullTracks: Track[] = [];
				for (const track of parsed.tracks) {
					if (!track.title || !track.duration || track.duration === 30000) {
						try {
							const fullTrack = await request(`/tracks/${track.id}`);
							fullTracks.push(TrackSchema.parse(fullTrack));
						} catch {
							fullTracks.push(track);
						}
					} else {
						fullTracks.push(track);
					}
				}
				return { ...parsed, tracks: fullTracks };
			}

			return parsed;
		},

		getClientId: () => clientId,

		getStats: () => rateLimiter.getStats(),
	};
};
