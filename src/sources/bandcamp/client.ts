import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	AutocompleteResultSchema,
	TralbumDetailsSchema,
	type AutocompleteItem,
	type TralbumDetails,
} from "./schemas.js";

export type BandcampClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type BandcampClient = {
	readonly search: (
		query: string,
	) => Promise<readonly AutocompleteItem[]>;
	readonly getAlbum: (bandId: number, albumId: number) => Promise<TralbumDetails>;
	readonly getTrack: (bandId: number, trackId: number) => Promise<TralbumDetails>;
	readonly getArtworkUrl: (artId: number, size?: number) => string;
	readonly getStats: () => RateLimiterStats;
};

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
