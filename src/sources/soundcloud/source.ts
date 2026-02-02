import type { NormalizedRelease, MetadataSource, MetadataSearchQuery, ReleaseType } from "../types.js";
import { createSoundCloudClient } from "./client.js";
import type { Playlist } from "./schemas.js";

const mapSetTypeToReleaseType = (
	setType: string | null | undefined,
	isAlbum: boolean | undefined,
): ReleaseType => {
	if (setType === "ep") return "ep";
	if (setType === "compilation") return "compilation";
	if (setType === "single") return "single";
	if (isAlbum) return "album";
	return "other";
};

const normalizePlaylist = (playlist: Playlist): NormalizedRelease => {
	const artistName = playlist.user?.username ?? "Unknown";
	const rawYear = playlist.created_at
		? Number.parseInt(playlist.created_at.slice(0, 4), 10)
		: null;
	const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : null;
	const artworkUrl = playlist.artwork_url;

	return {
		fingerprint: "",
		title: playlist.title,
		artists: [
			{
				name: artistName,
				ids: playlist.user ? [{ source: "soundcloud", id: String(playlist.user.id) }] : [],
			},
		],
		releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		...(year != null ? { year } : {}),
		ids: [{ source: "soundcloud", id: String(playlist.id) }],
		confidence: 1,
		genres: playlist.genre ? [playlist.genre] : [],
		...(artworkUrl != null ? { artworkUrl } : {}),
		sourceScores: { soundcloud: 100 },
	};
};

export type SoundCloudSourceConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly clientId?: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

const buildQuery = (input: MetadataSearchQuery): string => {
	if (input.kind === "text") return input.query;
	return `${input.artist} ${input.title}`;
};

export const createSoundCloudSource = async (
	config: SoundCloudSourceConfig,
): Promise<MetadataSource> => {
	const client = await createSoundCloudClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.clientId != null ? { clientId: config.clientId } : {}),
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const query = buildQuery(input);
		const playlists = await client.searchPlaylists(query, limit);
		return playlists.map(normalizePlaylist);
	};

	return {
		type: "soundcloud",
		name: "SoundCloud",
		searchReleases,
	};
};
