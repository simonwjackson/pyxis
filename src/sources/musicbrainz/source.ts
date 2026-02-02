import type { NormalizedRelease, ReleaseType, MetadataSource, MetadataSearchQuery } from "../types.js";
import { createMusicBrainzClient } from "./client.js";
import type { ReleaseGroup } from "./schemas.js";

// --- Normalizers ---

const mapMusicBrainzType = (primary?: string): ReleaseType => {
	switch (primary?.toLowerCase()) {
		case "album":
			return "album";
		case "ep":
			return "ep";
		case "single":
			return "single";
		case "compilation":
			return "compilation";
		case "soundtrack":
			return "soundtrack";
		case "live":
			return "live";
		case "remix":
			return "remix";
		default:
			return "other";
	}
};

const normalizeReleaseGroup = (rg: ReleaseGroup): NormalizedRelease => {
	const artistName =
		rg["artist-credit"]
			?.map((c) => (c.name ?? c.artist.name) + (c.joinphrase ?? ""))
			.join("") ?? "Unknown";

	const rawYear = rg["first-release-date"]
		? Number.parseInt(rg["first-release-date"].slice(0, 4), 10)
		: undefined;
	const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : undefined;

	// Extract genres from tags, sorted by vote count descending
	const genres = (rg.tags ?? [])
		.sort((a, b) => b.count - a.count)
		.map((t) => t.name);

	return {
		fingerprint: "",
		title: rg.title ?? "Unknown",
		artists: [
			{
				name: artistName,
				ids:
					rg["artist-credit"]?.map((c) => ({
						source: "musicbrainz" as const,
						id: c.artist.id,
					})) ?? [],
			},
		],
		releaseType: mapMusicBrainzType(rg["primary-type"]),
		...(year != null ? { year } : {}),
		ids: [{ source: "musicbrainz" as const, id: rg.id }],
		confidence: (rg.score ?? 0) / 100,
		genres,
		sourceScores: { musicbrainz: rg.score ?? 0 },
	};
};

// --- Source Config ---

export type MusicBrainzSourceConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

// --- Source Factory ---

export const createMusicBrainzSource = (
	config: MusicBrainzSourceConfig,
): MetadataSource => {
	const client = createMusicBrainzClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	const buildQuery = (input: MetadataSearchQuery): string => {
		if (input.kind === "text") return input.query;
		return `releasegroup:"${input.title}" AND artist:"${input.artist}"`;
	};

	const searchReleases = async (
		query: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const results = await client.searchReleaseGroup(buildQuery(query), limit);
		return results["release-groups"].map(normalizeReleaseGroup);
	};

	return {
		type: "musicbrainz",
		name: "MusicBrainz",
		searchReleases,
	};
};
