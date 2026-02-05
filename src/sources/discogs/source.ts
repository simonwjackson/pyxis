/**
 * @module discogs/source
 * Discogs metadata source implementation.
 * Provides release search capabilities using the Discogs API.
 */

import type { NormalizedRelease, MetadataSource, MetadataSearchQuery } from "../types.js";
import { createDiscogsClient } from "./client.js";
import type { DiscogsSearchResult } from "./schemas.js";

// --- Normalizers ---

const normalizeSearchResult = (
	result: DiscogsSearchResult,
): NormalizedRelease => {
	// Discogs title format: "Artist - Title" or just "Title"
	const titleParts = result.title.split(" - ");
	const hasArtistPrefix = titleParts.length > 1;
	const artist = hasArtistPrefix ? (titleParts[0] ?? "Unknown") : "Unknown";
	const title = hasArtistPrefix
		? titleParts.slice(1).join(" - ")
		: result.title;

	const rawYear = result.year
		? Number.parseInt(result.year, 10)
		: undefined;
	const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : undefined;
	const artworkUrl = result.cover_image ?? result.thumb;

	return {
		fingerprint: "",
		title,
		artists: [
			{
				name: artist.replace(/ \(\d+\)$/, ""), // Remove disambiguation numbers
				ids: [{ source: "discogs" as const, id: String(result.id) }],
			},
		],
		releaseType: "album", // Masters are typically albums
		...(year != null ? { year } : {}),
		ids: [{ source: "discogs" as const, id: String(result.id) }],
		confidence: 1,
		genres: [...(result.genre ?? []), ...(result.style ?? [])],
		...(artworkUrl != null ? { artworkUrl } : {}),
		sourceScores: { discogs: 100 },
	};
};

// --- Source Config ---

/**
 * Configuration options for creating a Discogs metadata source.
 * Includes required application identification and optional authentication/rate limiting.
 */
export type DiscogsSourceConfig = {
	/** Application name for User-Agent header (required by Discogs API) */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact email/URL for User-Agent header */
	readonly contact: string;
	/** Discogs personal access token for authenticated requests (higher rate limits) */
	readonly token?: string;
	/** Maximum requests per second (default varies by auth status) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors */
	readonly maxRetries?: number;
};

// --- Source Factory ---

/**
 * Creates a Discogs metadata source for searching release information.
 * The source queries Discogs' master release endpoint and normalizes results
 * to the common NormalizedRelease format. Supports both text queries and
 * structured artist/title searches.
 *
 * @param config - Configuration including app identification, optional auth token, and rate limits
 * @returns MetadataSource with searchReleases capability
 */
export const createDiscogsSource = (
	config: DiscogsSourceConfig,
): MetadataSource => {
	const client = createDiscogsClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.token != null ? { token: config.token } : {}),
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	const buildQuery = (input: MetadataSearchQuery): { query: string; artist?: string } => {
		if (input.kind === "text") {
			// Legacy: parse artist: from string (backward compat for free-text)
			const artistMatch = input.query.match(
				/\bartist:([^\s]+(?:\s+[^\s:]+)*)/i,
			);
			if (artistMatch?.[1]) {
				return {
					query: input.query.replace(artistMatch[0], "").trim(),
					artist: artistMatch[1],
				};
			}
			return { query: input.query };
		}
		return { query: input.title, artist: input.artist };
	};

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const { query, artist } = buildQuery(input);
		const response = await client.searchMasters(query, {
			...(artist != null ? { artist } : {}),
			limit,
		});
		return response.results.map(normalizeSearchResult);
	};

	return {
		type: "discogs",
		name: "Discogs",
		searchReleases,
	};
};
