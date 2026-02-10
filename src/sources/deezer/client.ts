/**
 * @module deezer/client
 * Deezer API client with rate limiting and retry logic.
 * Uses the public api.deezer.com endpoints for album search.
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	AlbumSearchResultSchema,
	ErrorResponseSchema,
	type AlbumSearchItem,
} from "./schemas.js";

/**
 * Configuration options for creating a Deezer API client.
 * Includes application identification and rate limiting settings.
 */
export type DeezerClientConfig = {
	/** Application name for User-Agent header */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact URL/email for User-Agent header */
	readonly contact: string;
	/** Maximum requests per second (default: 5) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 10) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * Deezer API client interface.
 * Provides methods for searching albums and accessing rate limiter stats.
 */
export type DeezerClient = {
	/**
	 * Searches Deezer for albums matching the query.
	 * @param query - Search query string
	 * @param limit - Maximum number of results to return (default: 25)
	 * @returns Array of album search items
	 */
	readonly searchAlbums: (
		query: string,
		limit?: number,
	) => Promise<readonly AlbumSearchItem[]>;
	/**
	 * Returns current rate limiter statistics.
	 * @returns Stats including requests made, tokens available, etc.
	 */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Creates a Deezer API client with rate limiting and retry logic.
 * Uses Deezer's public API endpoints (no authentication required).
 *
 * @param config - Client configuration including app info and rate limit settings
 * @returns Deezer API client with searchAlbums and getStats methods
 *
 * @example
 * const client = createDeezerClient({
 *   appName: "MyApp",
 *   version: "1.0.0",
 *   contact: "https://myapp.example.com"
 * });
 * const albums = await client.searchAlbums("daft punk", 10);
 */
export const createDeezerClient = (config: DeezerClientConfig): DeezerClient => {
	const {
		appName,
		version,
		contact,
		requestsPerSecond = 5,
		burstSize = 10,
		maxRetries = 3,
	} = config;

	const baseUrl = "https://api.deezer.com";
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

		const searchParams = new URLSearchParams(
			Object.fromEntries(
				Object.entries(params).map(([k, v]) => [k, String(v)]),
			),
		);

		const url =
			Object.keys(params).length > 0
				? `${baseUrl}${endpoint}?${searchParams}`
				: `${baseUrl}${endpoint}`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": userAgent,
				Accept: "application/json",
			},
		});

		if (response.status === 429) {
			if (retryCount >= maxRetries) {
				throw new Error(`Deezer rate limited after ${maxRetries} retries`);
			}

			rateLimiter.onRateLimited();
			const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, params, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`Deezer API error: ${response.status} ${response.statusText}`,
			);
		}

		const data: unknown = await response.json();

		const errorParse = ErrorResponseSchema.safeParse(data);
		if (errorParse.success) {
			throw new Error(
				`Deezer API error: ${errorParse.data.error.message} (code: ${errorParse.data.error.code})`,
			);
		}

		return data;
	};

	return {
		searchAlbums: async (query: string, limit = 25) => {
			const data = await request("/search/album", { q: query, limit });
			const result = AlbumSearchResultSchema.parse(data);
			return result.data;
		},

		getStats: () => rateLimiter.getStats(),
	};
};
