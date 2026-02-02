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

export type DiscogsSourceConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly token?: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

// --- Source Factory ---

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
