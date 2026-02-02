import type { NormalizedRelease, MetadataSource, MetadataSearchQuery, ReleaseType } from "../types.js";
import { createBandcampClient } from "./client.js";
import type { AutocompleteItem } from "./schemas.js";

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

export type BandcampSourceConfig = {
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

export const createBandcampSource = (
	config: BandcampSourceConfig,
): MetadataSource => {
	const client = createBandcampClient({
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
		const items = await client.search(query);

		// Filter to only albums and tracks
		const releases = items.filter((item) => item.type === "a" || item.type === "t");

		return releases.slice(0, limit).map(normalizeAutocompleteItem);
	};

	return {
		type: "bandcamp",
		name: "Bandcamp",
		searchReleases,
	};
};
