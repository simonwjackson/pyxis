/**
 * @module bandcamp/client
 * Bandcamp API client with rate limiting and retry logic.
 * Uses public/mobile API endpoints for search and album/track details.
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	AutocompleteResultSchema,
	TralbumDetailsSchema,
	type AutocompleteItem,
	type TralbumDetails,
} from "./schemas.js";

/**
 * Configuration options for creating a Bandcamp API client.
 * Includes application identification and rate limiting settings.
 */
export type BandcampClientConfig = {
	/** Application name for User-Agent header */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact URL/email for User-Agent header */
	readonly contact: string;
	/** Maximum requests per second (default: 1) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 5) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit or server errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * Bandcamp API client interface.
 * Provides methods for searching, fetching albums/tracks, and rate limiter stats.
 */
export type BandcampClient = {
	/**
	 * Searches Bandcamp for artists, albums, and tracks.
	 * @param query - Search query string
	 * @returns Array of autocomplete items matching the search
	 */
	readonly search: (
		query: string,
	) => Promise<readonly AutocompleteItem[]>;
	/**
	 * Fetches complete album details including track listing.
	 * @param bandId - Bandcamp band/artist ID
	 * @param albumId - Bandcamp album ID
	 * @returns Full album details with tracks and streaming URLs
	 */
	readonly getAlbum: (bandId: number, albumId: number) => Promise<TralbumDetails>;
	/**
	 * Fetches track details including streaming URL.
	 * @param bandId - Bandcamp band/artist ID
	 * @param trackId - Bandcamp track ID
	 * @returns Track details with streaming URL
	 */
	readonly getTrack: (bandId: number, trackId: number) => Promise<TralbumDetails>;
	/**
	 * Generates artwork URL for a given art ID.
	 * @param artId - Bandcamp artwork ID
	 * @param size - Image size (2=350x350, 3=100x100, 5=700x700, 10=1200x1200)
	 * @returns Direct URL to the artwork image
	 */
	readonly getArtworkUrl: (artId: number, size?: number) => string;
	/**
	 * Returns current rate limiter statistics.
	 * @returns Stats including requests made, tokens available, etc.
	 */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Creates a Bandcamp API client with rate limiting and retry logic.
 * Uses Bandcamp's public autocomplete and mobile API endpoints.
 *
 * @param config - Client configuration including app info and rate limit settings
 * @returns Bandcamp API client with search, getAlbum, getTrack, getArtworkUrl, and getStats methods
 *
 * @example
 * const client = createBandcampClient({
 *   appName: "MyApp",
 *   version: "1.0.0",
 *   contact: "https://myapp.example.com"
 * });
 * const results = await client.search("ambient electronic");
 */
export const createBandcampClient = (
	config: BandcampClientConfig,
): BandcampClient => {
	const {
		appName,
		version,
		contact,
		requestsPerSecond = 1,
		burstSize = 5,
		maxRetries = 3,
	} = config;

	const baseUrl = "https://bandcamp.com";
	const userAgent = `${appName}/${version} (${contact})`;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async (
		url: string,
		options?: { readonly method?: string; readonly body?: string },
		retryCount = 0,
	): Promise<unknown> => {
		await rateLimiter.acquire();

		const response = await fetch(url, {
			method: options?.method ?? "GET",
			headers: {
				"User-Agent": userAgent,
				Accept: "application/json",
				...(options?.body ? { "Content-Type": "application/json" } : {}),
			},
			...(options?.body != null ? { body: options.body } : {}),
		});

		if (response.status === 429 || response.status === 503) {
			if (retryCount >= maxRetries) {
				throw new Error(`Bandcamp rate limited after ${maxRetries} retries`);
			}

			rateLimiter.onRateLimited();
			const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(url, options, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`Bandcamp API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json() as Promise<unknown>;
	};

	return {
		search: async (query: string) => {
			const body = JSON.stringify({
				search_text: query,
				search_filter: "",
				full_page: false,
				fan_id: null,
			});

			const data = await request(
				`${baseUrl}/api/bcsearch_public_api/1/autocomplete_elastic`,
				{ method: "POST", body },
			);

			const result = AutocompleteResultSchema.parse(data);
			return result.auto.results;
		},

		getAlbum: async (bandId: number, albumId: number) => {
			const data = await request(
				`${baseUrl}/api/mobile/25/tralbum_details?band_id=${bandId}&tralbum_type=a&tralbum_id=${albumId}`,
			);
			return TralbumDetailsSchema.parse(data);
		},

		getTrack: async (bandId: number, trackId: number) => {
			const data = await request(
				`${baseUrl}/api/mobile/25/tralbum_details?band_id=${bandId}&tralbum_type=t&tralbum_id=${trackId}`,
			);
			return TralbumDetailsSchema.parse(data);
		},

		getArtworkUrl: (artId: number, size = 10) => {
			// Size options: 2=350x350, 3=100x100, 5=700x700, 10=1200x1200
			return `https://f4.bcbits.com/img/a${artId}_${size}.jpg`;
		},

		getStats: () => rateLimiter.getStats(),
	};
};
