/**
 * @module musicbrainz/client
 * MusicBrainz API client with rate limiting and retry logic.
 * Uses the official MusicBrainz web service API.
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	ArtistSchema,
	ArtistSearchResultSchema,
	RecordingSearchResultSchema,
	ReleaseGroupSearchResultSchema,
	ReleaseSearchResultSchema,
	type Artist,
	type ArtistSearchResult,
	type RecordingSearchResult,
	type ReleaseGroupSearchResult,
	type ReleaseSearchResult,
} from "./schemas.js";

/**
 * Configuration options for creating a MusicBrainz API client.
 * Includes application identification and rate limiting settings.
 * MusicBrainz requires proper User-Agent identification.
 */
export type MusicBrainzClientConfig = {
	/** Application name for User-Agent header (required by MusicBrainz API) */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact email/URL for User-Agent header (required) */
	readonly contact: string;
	/** Maximum requests per second (default: 1 per MusicBrainz guidelines) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 5) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * MusicBrainz API client interface.
 * Provides methods for searching artists, releases, recordings, and release groups.
 */
export type MusicBrainzClient = {
	/**
	 * Searches MusicBrainz for artists.
	 * @param query - Lucene search query or plain text
	 * @param limit - Maximum number of results (default: 10)
	 * @returns Artist search results with scores
	 */
	readonly searchArtist: (
		query: string,
		limit?: number,
	) => Promise<ArtistSearchResult>;
	/**
	 * Searches MusicBrainz for releases (specific editions).
	 * @param query - Lucene search query or plain text
	 * @param limit - Maximum number of results (default: 10)
	 * @returns Release search results with scores
	 */
	readonly searchRelease: (
		query: string,
		limit?: number,
	) => Promise<ReleaseSearchResult>;
	/**
	 * Searches MusicBrainz for release groups (albums, EPs, singles).
	 * @param query - Lucene search query or plain text
	 * @param limit - Maximum number of results (default: 10)
	 * @returns Release group search results with scores
	 */
	readonly searchReleaseGroup: (
		query: string,
		limit?: number,
	) => Promise<ReleaseGroupSearchResult>;
	/**
	 * Searches MusicBrainz for recordings (individual tracks).
	 * @param query - Lucene search query or plain text
	 * @param limit - Maximum number of results (default: 10)
	 * @returns Recording search results with scores
	 */
	readonly searchRecording: (
		query: string,
		limit?: number,
	) => Promise<RecordingSearchResult>;
	/**
	 * Fetches detailed artist information by MBID.
	 * @param mbid - MusicBrainz artist ID (UUID format)
	 * @param includes - Optional sub-queries to include (e.g., "release-groups")
	 * @returns Full artist details
	 */
	readonly getArtist: (
		mbid: string,
		includes?: readonly string[],
	) => Promise<Artist>;
	/**
	 * Returns current rate limiter statistics.
	 * @returns Stats including requests made, tokens available, etc.
	 */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Creates a MusicBrainz API client with rate limiting and retry logic.
 * Follows MusicBrainz rate limiting guidelines (1 req/sec by default).
 *
 * @param config - Client configuration including app info and rate limit settings
 * @returns MusicBrainz API client with search and fetch methods
 *
 * @example
 * const client = createMusicBrainzClient({
 *   appName: "MyApp",
 *   version: "1.0.0",
 *   contact: "myemail@example.com"
 * });
 * const results = await client.searchReleaseGroup("dark side of the moon");
 */
export const createMusicBrainzClient = (
	config: MusicBrainzClientConfig,
): MusicBrainzClient => {
	const {
		appName,
		version,
		contact,
		requestsPerSecond = 1,
		burstSize = 5,
		maxRetries = 3,
	} = config;

	const baseUrl = "https://musicbrainz.org/ws/2";
	const userAgent = `${appName}/${version} (${contact})`;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async (
		endpoint: string,
		retryCount = 0,
	): Promise<unknown> => {
		await rateLimiter.acquire();

		const url = `${baseUrl}${endpoint}`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": userAgent,
				Accept: "application/json",
			},
		});

		if (response.status === 503) {
			if (retryCount >= maxRetries) {
				throw new Error(
					`MusicBrainz rate limited after ${maxRetries} retries`,
				);
			}

			rateLimiter.onRateLimited();
			const backoffMs =
				Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`MusicBrainz API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json();
	};

	return {
		searchArtist: async (query: string, limit = 10) => {
			const encoded = encodeURIComponent(query);
			const data = await request(
				`/artist?query=${encoded}&limit=${limit}&fmt=json`,
			);
			return ArtistSearchResultSchema.parse(data);
		},

		searchRelease: async (query: string, limit = 10) => {
			const encoded = encodeURIComponent(query);
			const data = await request(
				`/release?query=${encoded}&limit=${limit}&fmt=json`,
			);
			return ReleaseSearchResultSchema.parse(data);
		},

		searchReleaseGroup: async (query: string, limit = 10) => {
			const encoded = encodeURIComponent(query);
			const data = await request(
				`/release-group?query=${encoded}&limit=${limit}&fmt=json`,
			);
			return ReleaseGroupSearchResultSchema.parse(data);
		},

		searchRecording: async (query: string, limit = 10) => {
			const encoded = encodeURIComponent(query);
			const data = await request(
				`/recording?query=${encoded}&limit=${limit}&fmt=json`,
			);
			return RecordingSearchResultSchema.parse(data);
		},

		getArtist: async (mbid: string, includes: readonly string[] = []) => {
			const inc =
				includes.length > 0 ? `&inc=${includes.join("+")}` : "";
			const data = await request(`/artist/${mbid}?fmt=json${inc}`);
			return ArtistSchema.parse(data);
		},

		getStats: () => rateLimiter.getStats(),
	};
};
