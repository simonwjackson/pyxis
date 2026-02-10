/**
 * @module discogs/client
 * Discogs API client with rate limiting and retry logic.
 * Uses the official Discogs API for searching masters and artists.
 * @see https://www.discogs.com/developers
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	type DiscogsMaster,
	DiscogsMasterSchema,
	type DiscogsRateLimit,
	type DiscogsSearchResponse,
	DiscogsSearchResponseSchema,
} from "./schemas.js";

/**
 * Configuration options for creating a Discogs API client.
 * Includes application identification, authentication, and rate limiting settings.
 */
export type DiscogsClientConfig = {
	/** Application name for User-Agent header (required by Discogs API) */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact URL/email for User-Agent header */
	readonly contact: string;
	/** Discogs personal access token for higher rate limits (optional) */
	readonly token?: string;
	/** Maximum requests per second (default: 1 for unauthenticated) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 3) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * Discogs API client interface.
 * Provides methods for searching masters, getting master details, and rate limit info.
 */
export type DiscogsClient = {
	/**
	 * Searches Discogs for master releases.
	 * @param query - Search query string
	 * @param options - Optional search parameters (artist filter, limit)
	 * @returns Paginated search response with master releases
	 */
	readonly searchMasters: (
		query: string,
		options?: {
			readonly artist?: string;
			readonly limit?: number;
		},
	) => Promise<DiscogsSearchResponse>;
	/**
	 * Fetches detailed information about a master release.
	 * @param id - Discogs master release ID
	 * @returns Full master release details including tracklist
	 */
	readonly getMaster: (id: number) => Promise<DiscogsMaster>;
	/**
	 * Searches Discogs for artists.
	 * @param query - Search query string
	 * @param limit - Maximum number of results (default: 20)
	 * @returns Paginated search response with artist results
	 */
	readonly searchArtists: (
		query: string,
		limit?: number,
	) => Promise<DiscogsSearchResponse>;
	/**
	 * Returns the last rate limit information from response headers.
	 * @returns Rate limit info (limit, used, remaining) or null if not available
	 */
	readonly getRateLimit: () => DiscogsRateLimit | null;
	/**
	 * Returns current rate limiter statistics.
	 * @returns Stats including requests made, tokens available, etc.
	 */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Creates a Discogs API client with rate limiting and retry logic.
 * Uses Discogs' official API with proper User-Agent identification.
 *
 * @param config - Client configuration including app info, optional token, and rate limit settings
 * @returns Discogs API client with search and fetch methods
 *
 * @example
 * const client = createDiscogsClient({
 *   appName: "MyApp",
 *   version: "1.0.0",
 *   contact: "https://myapp.example.com",
 *   token: "your-discogs-token" // Optional, for higher rate limits
 * });
 * const results = await client.searchMasters("dark side of the moon", { artist: "pink floyd" });
 */
export const createDiscogsClient = (
	config: DiscogsClientConfig,
): DiscogsClient => {
	const {
		appName,
		version,
		contact,
		token,
		requestsPerSecond = 1,
		burstSize = 3,
		maxRetries = 3,
	} = config;

	const baseUrl = "https://api.discogs.com";
	const userAgent = `${appName}/${version} +${contact}`;

	let lastRateLimit: DiscogsRateLimit | null = null;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async <T>(
		endpoint: string,
		params: Record<string, string | number> = {},
		retryCount = 0,
	): Promise<T> => {
		await rateLimiter.acquire();

		const searchParams = new URLSearchParams(
			Object.fromEntries(
				Object.entries(params).map(([k, v]) => [k, String(v)]),
			),
		);

		const url = `${baseUrl}${endpoint}${searchParams.toString() ? `?${searchParams}` : ""}`;

		const headers: Record<string, string> = {
			"User-Agent": userAgent,
			Accept: "application/json",
		};

		if (token) {
			headers["Authorization"] = `Discogs token=${token}`;
		}

		const response = await fetch(url, { headers });

		// Track rate limits from headers
		const limit = response.headers.get("X-Discogs-Ratelimit");
		const used = response.headers.get("X-Discogs-Ratelimit-Used");
		const remaining = response.headers.get("X-Discogs-Ratelimit-Remaining");

		if (limit && used && remaining) {
			lastRateLimit = {
				limit: Number.parseInt(limit, 10),
				used: Number.parseInt(used, 10),
				remaining: Number.parseInt(remaining, 10),
			};
		}

		if (response.status === 429) {
			if (retryCount >= maxRetries) {
				throw new Error(
					`Discogs rate limited after ${maxRetries} retries`,
				);
			}

			rateLimiter.onRateLimited();
			const backoffMs = 2 ** retryCount * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, params, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`Discogs API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json() as Promise<T>;
	};

	return {
		searchMasters: async (query, options = {}) => {
			const { artist, limit = 20 } = options;
			const params: Record<string, string | number> = {
				type: "master",
				per_page: limit,
			};

			if (query) params["q"] = query;
			if (artist) params["artist"] = artist;

			const data = await request<unknown>("/database/search", params);
			return DiscogsSearchResponseSchema.parse(data);
		},

		getMaster: async (id) => {
			const data = await request<unknown>(`/masters/${id}`);
			return DiscogsMasterSchema.parse(data);
		},

		searchArtists: async (query, limit = 20) => {
			const data = await request<unknown>("/database/search", {
				type: "artist",
				q: query,
				per_page: limit,
			});
			return DiscogsSearchResponseSchema.parse(data);
		},

		getRateLimit: () => lastRateLimit,

		getStats: () => rateLimiter.getStats(),
	};
};
