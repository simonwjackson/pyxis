import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	AlbumSearchResultSchema,
	ErrorResponseSchema,
	type AlbumSearchItem,
} from "./schemas.js";

export type DeezerClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type DeezerClient = {
	readonly searchAlbums: (
		query: string,
		limit?: number,
	) => Promise<readonly AlbumSearchItem[]>;
	readonly getStats: () => RateLimiterStats;
};

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
