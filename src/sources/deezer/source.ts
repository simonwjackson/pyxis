import type { NormalizedRelease, MetadataSource, MetadataSearchQuery, ReleaseType } from "../types.js";
import { createDeezerClient } from "./client.js";
import type { AlbumSearchItem } from "./schemas.js";

const mapRecordTypeToReleaseType = (recordType: string | undefined): ReleaseType => {
	if (!recordType) return "album";
	const normalized = recordType.toLowerCase();
	if (normalized === "ep") return "ep";
	if (normalized === "single") return "single";
	if (normalized === "compilation") return "compilation";
	return "album";
};

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

export type DeezerSourceConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

const buildQuery = (input: MetadataSearchQuery): string => {
	if (input.kind === "text") return input.query;
	return `${input.artist} ${input.title}`;
};

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
