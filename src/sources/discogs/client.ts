import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	type DiscogsMaster,
	DiscogsMasterSchema,
	type DiscogsRateLimit,
	type DiscogsSearchResponse,
	DiscogsSearchResponseSchema,
} from "./schemas.js";

export type DiscogsClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly token?: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type DiscogsClient = {
	readonly searchMasters: (
		query: string,
		options?: {
			readonly artist?: string;
			readonly limit?: number;
		},
	) => Promise<DiscogsSearchResponse>;
	readonly getMaster: (id: number) => Promise<DiscogsMaster>;
	readonly searchArtists: (
		query: string,
		limit?: number,
	) => Promise<DiscogsSearchResponse>;
	readonly getRateLimit: () => DiscogsRateLimit | null;
	readonly getStats: () => RateLimiterStats;
};

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
