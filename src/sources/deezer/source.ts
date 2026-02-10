/**
 * @module deezer/source
 * Deezer metadata source implementation for the Pyxis music player.
 * Provides album search capabilities using the Deezer API.
 */

import type { NormalizedRelease, MetadataSource, MetadataSearchQuery, ReleaseType } from "../types.js";
import { createDeezerClient } from "./client.js";
import type { AlbumSearchItem } from "./schemas.js";

/**
 * Maps Deezer record type to canonical release type.
 *
 * @param recordType - Deezer record type string (album, single, ep, compilation)
 * @returns Canonical release type
 */
const mapRecordTypeToReleaseType = (recordType: string | undefined): ReleaseType => {
	if (!recordType) return "album";
	const normalized = recordType.toLowerCase();
	if (normalized === "ep") return "ep";
	if (normalized === "single") return "single";
	if (normalized === "compilation") return "compilation";
	return "album";
};

/**
 * Converts a Deezer album search item to normalized release format.
 *
 * @param album - Deezer album search result item
 * @returns Normalized release object for cross-source compatibility
 */
const normalizeAlbum = (album: AlbumSearchItem): NormalizedRelease => {
	const artistName = album.artist?.name ?? "Unknown";
	const artworkUrl = album.cover_medium ?? album.cover;

	return {
		fingerprint: "",
		title: album.title,
		artists: [
			{
				name: artistName,
				ids: album.artist ? [{ source: "deezer", id: String(album.artist.id) }] : [],
			},
		],
		releaseType: mapRecordTypeToReleaseType(album.record_type),
		ids: [{ source: "deezer", id: String(album.id) }],
		confidence: 1,
		genres: [],
		...(artworkUrl != null ? { artworkUrl } : {}),
		sourceScores: { deezer: 100 },
	};
};

/**
 * Configuration options for creating a Deezer metadata source.
 * Includes application identification and rate limiting settings.
 */
export type DeezerSourceConfig = {
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
 * Builds a search query string from a metadata search query.
 *
 * @param input - Metadata search query (text or structured)
 * @returns Search query string for Deezer API
 */
const buildQuery = (input: MetadataSearchQuery): string => {
	if (input.kind === "text") return input.query;
	return `${input.artist} ${input.title}`;
};

/**
 * Creates a Deezer metadata source for searching release information.
 * The source queries Deezer's album search endpoint and normalizes results
 * to the common NormalizedRelease format.
 *
 * @param config - Configuration including app identification and rate limit settings
 * @returns MetadataSource with searchReleases capability
 *
 * @example
 * const source = createDeezerSource({
 *   appName: "Pyxis",
 *   version: "1.0.0",
 *   contact: "https://github.com/user/pyxis"
 * });
 * const releases = await source.searchReleases({ kind: "text", query: "daft punk" });
 */
export const createDeezerSource = (
	config: DeezerSourceConfig,
): MetadataSource => {
	const client = createDeezerClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const query = buildQuery(input);
		const albums = await client.searchAlbums(query, limit);
		return albums.map(normalizeAlbum);
	};

	return {
		type: "deezer",
		name: "Deezer",
		searchReleases,
	};
};
