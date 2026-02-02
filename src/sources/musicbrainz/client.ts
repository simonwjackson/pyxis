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

export type MusicBrainzClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type MusicBrainzClient = {
	readonly searchArtist: (
		query: string,
		limit?: number,
	) => Promise<ArtistSearchResult>;
	readonly searchRelease: (
		query: string,
		limit?: number,
	) => Promise<ReleaseSearchResult>;
	readonly searchReleaseGroup: (
		query: string,
		limit?: number,
	) => Promise<ReleaseGroupSearchResult>;
	readonly searchRecording: (
		query: string,
		limit?: number,
	) => Promise<RecordingSearchResult>;
	readonly getArtist: (
		mbid: string,
		includes?: readonly string[],
	) => Promise<Artist>;
	readonly getStats: () => RateLimiterStats;
};

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
