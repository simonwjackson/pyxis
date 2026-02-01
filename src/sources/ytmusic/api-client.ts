/**
 * YouTube Music internal API client.
 * Uses /youtubei/v1/search and /browse endpoints for album search and details.
 * Ported from raziel — only album-related methods included.
 */

import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import { BASE_CONTEXT, DEFAULT_HEADERS, SEARCH_PARAMS } from "./api-config.js";
import {
	parseAlbumBrowseInfo,
	parseAlbumBrowseTracks,
	parseAlbumSearchResults,
	type ParsedAlbum,
	type ParsedTrack,
} from "./parsers.js";

export type YTMusicApiClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type AlbumDetails = {
	readonly id: string;
	readonly name: string;
	readonly artists?: readonly {
		readonly name: string;
		readonly id: string;
	}[];
	readonly year: number | null;
	readonly thumbnailUrl: string | null;
	readonly tracks: readonly ParsedTrack[];
};

export type YTMusicApiClient = {
	readonly searchAlbums: (query: string) => Promise<readonly ParsedAlbum[]>;
	readonly getAlbum: (albumId: string) => Promise<AlbumDetails>;
	readonly getStats: () => RateLimiterStats;
};

export const createYTMusicApiClient = (
	config: YTMusicApiClientConfig,
): YTMusicApiClient => {
	const {
		appName,
		version,
		contact,
		requestsPerSecond = 1,
		burstSize = 5,
		maxRetries = 3,
	} = config;

	const baseUrl = "https://music.youtube.com/youtubei/v1";
	const userAgent = `${appName}/${version} (${contact})`;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async (
		endpoint: string,
		data: Record<string, unknown> = {},
		retryCount = 0,
	): Promise<unknown> => {
		await rateLimiter.acquire();

		const url = `${baseUrl}/${endpoint}?prettyPrint=false`;

		// Merge with base context
		const requestData = {
			...BASE_CONTEXT,
			...data,
			context: {
				...BASE_CONTEXT.context,
				...(data.context as Record<string, unknown> | undefined),
				client: {
					...BASE_CONTEXT.context.client,
					...((data.context as Record<string, unknown> | undefined)
						?.client as Record<string, unknown> | undefined),
					userAgent,
				},
			},
		};

		const response = await fetch(url, {
			method: "POST",
			headers: {
				...DEFAULT_HEADERS,
				"User-Agent": userAgent,
			},
			body: JSON.stringify(requestData),
		});

		if (response.status === 429 || response.status === 503) {
			if (retryCount >= maxRetries) {
				throw new Error(
					`YouTube Music rate limited after ${maxRetries} retries`,
				);
			}

			rateLimiter.onRateLimited();
			const backoffMs =
				Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, data, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`YouTube Music API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json();
	};

	return {
		searchAlbums: async (query: string) => {
			const data = await request("search", {
				query,
				params: SEARCH_PARAMS.album,
				context: {
					client: {
						originalUrl: "https://music.youtube.com/library",
					},
				},
			});
			return parseAlbumSearchResults(data as Record<string, unknown>);
		},

		getAlbum: async (albumId: string) => {
			// Album IDs can be MPREb_ (browse ID) or OLAK (playlist ID)
			const browseId = albumId.startsWith("OLAK")
				? `VL${albumId}` // Convert playlist ID to browse ID format
				: albumId;

			const data = await request("browse", {
				browseId,
				context: {
					client: {
						originalUrl: `https://music.youtube.com/browse/${browseId}`,
					},
				},
			});

			const browseResponse = data as Record<string, unknown>;
			const tracks = parseAlbumBrowseTracks(browseResponse);
			const info = parseAlbumBrowseInfo(browseResponse);

			// Get OLAK ID from microformat if available
			const microformat = browseResponse?.microformat as
				| Record<string, unknown>
				| undefined;
			const renderer = microformat?.microformatDataRenderer as
				| Record<string, unknown>
				| undefined;
			const urlCanonical = renderer?.urlCanonical as string | undefined;
			const olakMatch = urlCanonical?.match(
				/list=(OLAK5uy_[A-Za-z0-9_-]{33})/,
			);
			const resolvedId = olakMatch?.[1] ?? albumId;

			return {
				id: resolvedId,
				name: info.name,
				...(info.artists.length > 0 ? { artists: info.artists } : {}),
				year: info.year,
				thumbnailUrl: info.thumbnailUrl,
				tracks,
			};
		},

		getStats: () => rateLimiter.getStats(),
	};
};
