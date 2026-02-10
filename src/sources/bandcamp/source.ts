/**
 * @module bandcamp/source
 * Bandcamp source implementation for the Pyxis music player.
 * Provides search, album details, and streaming capabilities.
 */

import type {
	NormalizedRelease,
	MetadataSource,
	MetadataSearchQuery,
	ReleaseType,
	Source,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
} from "../types.js";
import { createBandcampClient } from "./client.js";
import type { AutocompleteItem, Track } from "./schemas.js";

/**
 * Maps Bandcamp item type codes to canonical release types.
 *
 * @param type - Bandcamp type code ("a" for album, "t" for track)
 * @returns Canonical release type
 */
const mapBandcampTypeToReleaseType = (type: string): ReleaseType => {
	switch (type) {
		case "a":
			return "album";
		case "t":
			return "single";
		default:
			return "other";
	}
};

/**
 * Converts a Bandcamp autocomplete item to a normalized release format.
 *
 * @param item - Bandcamp autocomplete search result item
 * @returns Normalized release object for cross-source compatibility
 */
const normalizeAutocompleteItem = (item: AutocompleteItem): NormalizedRelease => {
	const artistName = item.band_name ?? "Unknown";
	const releaseType = mapBandcampTypeToReleaseType(item.type);

	const artworkUrl = item.art_id
		? `https://f4.bcbits.com/img/a${item.art_id}_2.jpg`
		: item.img_id
			? `https://f4.bcbits.com/img/${item.img_id}_2.jpg`
			: null;

	return {
		fingerprint: "",
		title: item.name,
		artists: [
			{
				name: artistName,
				ids: item.band_id ? [{ source: "bandcamp", id: String(item.band_id) }] : [],
			},
		],
		releaseType,
		ids: [{ source: "bandcamp", id: String(item.id) }],
		confidence: 1,
		genres: item.tag_names ?? [],
		...(artworkUrl != null ? { artworkUrl } : {}),
		sourceScores: { bandcamp: 100 },
	};
};

/**
 * Encodes band ID and item ID into a composite ID string.
 * Format: "bandId:itemId" (e.g., "123456:789012")
 *
 * @param bandId - Bandcamp band/artist ID
 * @param itemId - Bandcamp album or track ID
 * @returns Composite ID string
 */
const encodeCompositeId = (bandId: number, itemId: number): string =>
	`${bandId}:${itemId}`;

/**
 * Decodes a composite ID string back into band ID and item ID.
 *
 * @param compositeId - Composite ID in "bandId:itemId" format
 * @returns Object with bandId and itemId numbers
 * @throws Error if the composite ID format is invalid
 */
const decodeCompositeId = (compositeId: string): { readonly bandId: number; readonly itemId: number } => {
	const idx = compositeId.indexOf(":");
	if (idx === -1) {
		throw new Error(`Invalid Bandcamp composite ID: ${compositeId}`);
	}
	return {
		bandId: Number(compositeId.slice(0, idx)),
		itemId: Number(compositeId.slice(idx + 1)),
	};
};

/**
 * Converts a Bandcamp track to canonical track format.
 *
 * @param track - Bandcamp track object from API
 * @param albumTitle - Parent album title
 * @param albumArtist - Parent album artist name
 * @param bandId - Bandcamp band ID for composite ID generation
 * @returns Canonical track object
 */
const bandcampTrackToCanonical = (
	track: Track,
	albumTitle: string,
	albumArtist: string,
	bandId: number,
): CanonicalTrack => ({
	id: encodeCompositeId(bandId, track.track_id),
	title: track.title,
	artist: track.band_name ?? albumArtist,
	album: albumTitle,
	sourceId: { source: "bandcamp", id: encodeCompositeId(bandId, track.track_id) },
	...(track.duration != null ? { duration: Math.round(track.duration) } : {}),
	...(track.art_id != null
		? { artworkUrl: `https://f4.bcbits.com/img/a${track.art_id}_10.jpg` }
		: {}),
});

/**
 * Configuration options for creating a Bandcamp source.
 * Includes application identification and rate limiting settings.
 */
export type BandcampSourceConfig = {
	/** Application name for User-Agent header */
	readonly appName: string;
	/** Application version for User-Agent header */
	readonly version: string;
	/** Contact URL/email for User-Agent header */
	readonly contact: string;
	/** Maximum requests per second (default: 1) */
	readonly requestsPerSecond?: number;
	/** Token bucket burst size for rate limiting (default: 5) */
	readonly burstSize?: number;
	/** Maximum retry attempts on rate limit errors (default: 3) */
	readonly maxRetries?: number;
};

/**
 * Builds a search query string from a metadata search query.
 *
 * @param input - Metadata search query (text or structured)
 * @returns Search query string for Bandcamp API
 */
const buildQuery = (input: MetadataSearchQuery): string => {
	if (input.kind === "text") return input.query;
	return `${input.artist} ${input.title}`;
};

/**
 * Combined Bandcamp source type implementing both Source and MetadataSource.
 * Provides full playback capabilities (search, albums, streaming) plus metadata search.
 */
export type BandcampFullSource = Source & MetadataSource;

/**
 * Creates a full Bandcamp source with both playback and metadata capabilities.
 * Implements SearchCapability, AlbumCapability, StreamCapability, and MetadataSource.
 *
 * @param config - Source configuration including app info and rate limit settings
 * @returns Full Bandcamp source with all capabilities
 *
 * @example
 * const source = createBandcampFullSource({
 *   appName: "Pyxis",
 *   version: "1.0.0",
 *   contact: "https://github.com/user/pyxis"
 * });
 * const results = await source.search("ambient");
 * const album = await source.getAlbumTracks("123456:789012");
 */
export const createBandcampFullSource = (
	config: BandcampSourceConfig,
): BandcampFullSource => {
	const client = createBandcampClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	// --- MetadataSource capability ---

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const query = buildQuery(input);
		const items = await client.search(query);
		const releases = items.filter((item) => item.type === "a" || item.type === "t");
		return releases.slice(0, limit).map(normalizeAutocompleteItem);
	};

	// --- SearchCapability ---

	const search = async (query: string): Promise<SearchResult> => {
		const items = await client.search(query);

		const albums: CanonicalAlbum[] = [];
		const tracks: CanonicalTrack[] = [];

		for (const item of items) {
			if (item.type === "a" && item.band_id != null) {
				const artworkUrl = item.art_id
					? client.getArtworkUrl(item.art_id, 5)
					: undefined;
				albums.push({
					id: encodeCompositeId(item.band_id, item.id),
					title: item.name,
					artist: item.band_name ?? "Unknown",
					tracks: [],
					sourceIds: [{ source: "bandcamp", id: encodeCompositeId(item.band_id, item.id) }],
					genres: item.tag_names ?? [],
					...(artworkUrl != null ? { artworkUrl } : {}),
				});
			} else if (item.type === "t" && item.band_id != null) {
				const artworkUrl = item.art_id
					? client.getArtworkUrl(item.art_id, 5)
					: undefined;
				tracks.push({
					id: encodeCompositeId(item.band_id, item.id),
					title: item.name,
					artist: item.band_name ?? "Unknown",
					album: "",
					sourceId: { source: "bandcamp", id: encodeCompositeId(item.band_id, item.id) },
					...(artworkUrl != null ? { artworkUrl } : {}),
				});
			}
		}

		return { tracks, albums };
	};

	// --- AlbumCapability ---

	const getAlbumTracks = async (albumId: string) => {
		const { bandId, itemId } = decodeCompositeId(albumId);
		const details = await client.getAlbum(bandId, itemId);

		const albumArtist = details.tralbum_artist ?? details.band?.name ?? "Unknown";
		const artworkUrl = details.art_id != null
			? client.getArtworkUrl(details.art_id, 10)
			: undefined;

		const releaseYear = details.release_date != null
			? new Date(details.release_date * 1000).getFullYear()
			: undefined;

		const canonicalTracks: readonly CanonicalTrack[] = (details.tracks ?? []).map(
			(track, index) => ({
				...bandcampTrackToCanonical(track, details.title, albumArtist, bandId),
				// Use album artwork as fallback if track has no art
				...(track.art_id == null && artworkUrl != null ? { artworkUrl } : {}),
				trackIndex: index,
			}),
		);

		const genres = details.tags?.map((t) => t.name) ?? [];

		const album: CanonicalAlbum = {
			id: albumId,
			title: details.title,
			artist: albumArtist,
			tracks: canonicalTracks,
			sourceIds: [{ source: "bandcamp", id: albumId }],
			...(releaseYear != null ? { year: releaseYear } : {}),
			...(artworkUrl != null ? { artworkUrl } : {}),
			...(genres.length > 0 ? { genres } : {}),
		};

		return { album, tracks: canonicalTracks };
	};

	// --- StreamCapability ---

	const getStreamUrl = async (trackId: string): Promise<string> => {
		const { bandId, itemId } = decodeCompositeId(trackId);
		const details = await client.getTrack(bandId, itemId);

		const track = details.tracks?.[0];
		if (!track) {
			throw new Error(`Bandcamp: no track data for ${trackId}`);
		}

		const streamUrl = track.streaming_url != null && typeof track.streaming_url === "object"
			? track.streaming_url["mp3-128"]
			: undefined;

		if (!streamUrl) {
			throw new Error(`Bandcamp: no streaming URL for track ${trackId}`);
		}

		return streamUrl;
	};

	return {
		type: "bandcamp",
		name: "Bandcamp",
		searchReleases,
		search,
		getAlbumTracks,
		getStreamUrl,
	};
};

/**
 * Creates a Bandcamp metadata-only source for release search.
 * Backwards-compatible factory that wraps createBandcampFullSource.
 *
 * @param config - Source configuration including app info and rate limit settings
 * @returns MetadataSource with searchReleases capability
 */
export const createBandcampSource = (
	config: BandcampSourceConfig,
): MetadataSource => createBandcampFullSource(config);
