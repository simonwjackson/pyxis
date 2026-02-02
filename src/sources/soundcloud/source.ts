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
import { createSoundCloudClient, type SoundCloudClient } from "./client.js";
import type { Playlist, Track } from "./schemas.js";

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

const soundcloudTrackToCanonical = (
	track: Track,
	albumTitle: string,
): CanonicalTrack => ({
	id: String(track.id),
	title: track.title ?? "Unknown",
	artist: track.user?.username ?? "Unknown",
	album: albumTitle,
	sourceId: { source: "soundcloud", id: String(track.id) },
	// SoundCloud durations are in milliseconds, convert to seconds
	...(track.duration != null ? { duration: Math.round(track.duration / 1000) } : {}),
	...(track.artwork_url != null ? { artworkUrl: track.artwork_url } : {}),
});

const resolveStreamUrl = async (track: Track, clientId: string): Promise<string> => {
	// Find a progressive (HTTP) stream URL from transcodings
	const transcoding = track.media?.transcodings?.find(
		(t) => t.format?.protocol === "progressive",
	);
	if (!transcoding) {
		throw new Error(`SoundCloud: no progressive transcoding for track ${track.id}`);
	}

	// The transcoding URL requires client_id to resolve to direct audio URL
	const streamResponse = await fetch(`${transcoding.url}?client_id=${clientId}`);
	if (!streamResponse.ok) {
		throw new Error(`SoundCloud: failed to resolve stream URL for track ${track.id}`);
	}

	const data = (await streamResponse.json()) as { url?: string };
	if (!data.url) {
		throw new Error(`SoundCloud: empty stream URL for track ${track.id}`);
	}

	return data.url;
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

// Combined type: satisfies both Source and MetadataSource
export type SoundCloudFullSource = Source & MetadataSource;

const buildFullSource = (client: SoundCloudClient): SoundCloudFullSource => {
	// --- MetadataSource capability ---

	const searchReleases = async (
		input: MetadataSearchQuery,
		limit = 10,
	): Promise<readonly NormalizedRelease[]> => {
		const query = buildQuery(input);
		const playlists = await client.searchPlaylists(query, limit);
		return playlists.map(normalizePlaylist);
	};

	// --- SearchCapability ---

	const search = async (query: string): Promise<SearchResult> => {
		const playlists = await client.searchPlaylists(query, 20);

		const albums: CanonicalAlbum[] = playlists.map((playlist) => ({
			id: String(playlist.id),
			title: playlist.title,
			artist: playlist.user?.username ?? "Unknown",
			tracks: [],
			sourceIds: [{ source: "soundcloud" as const, id: String(playlist.id) }],
			...(playlist.artwork_url != null ? { artworkUrl: playlist.artwork_url } : {}),
			...(playlist.genre != null ? { genres: [playlist.genre] } : {}),
			releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		}));

		return { tracks: [], albums };
	};

	// --- AlbumCapability ---

	const getAlbumTracks = async (albumId: string) => {
		const playlist = await client.getPlaylistWithFullTracks(Number(albumId));

		const canonicalTracks: readonly CanonicalTrack[] = (playlist.tracks ?? []).map(
			(track, index) => ({
				...soundcloudTrackToCanonical(track, playlist.title),
				// Use album artwork as fallback if track has no art
				...(track.artwork_url == null && playlist.artwork_url != null
					? { artworkUrl: playlist.artwork_url }
					: {}),
				trackIndex: index,
			}),
		);

		const rawYear = playlist.created_at
			? Number.parseInt(playlist.created_at.slice(0, 4), 10)
			: null;
		const year = rawYear != null && !Number.isNaN(rawYear) ? rawYear : undefined;

		const album: CanonicalAlbum = {
			id: albumId,
			title: playlist.title,
			artist: playlist.user?.username ?? "Unknown",
			tracks: canonicalTracks,
			sourceIds: [{ source: "soundcloud", id: albumId }],
			...(year != null ? { year } : {}),
			...(playlist.artwork_url != null ? { artworkUrl: playlist.artwork_url } : {}),
			...(playlist.genre != null ? { genres: [playlist.genre] } : {}),
			releaseType: mapSetTypeToReleaseType(playlist.set_type, playlist.is_album),
		};

		return { album, tracks: canonicalTracks };
	};

	// --- StreamCapability ---

	const getStreamUrl = async (trackId: string): Promise<string> => {
		const clientId = client.getClientId();
		if (!clientId) {
			throw new Error("SoundCloud: client_id not available for stream resolution");
		}

		const track = await client.getTrack(Number(trackId));
		return resolveStreamUrl(track, clientId);
	};

	return {
		type: "soundcloud",
		name: "SoundCloud",
		searchReleases,
		search,
		getAlbumTracks,
		getStreamUrl,
	};
};

export const createSoundCloudFullSource = async (
	config: SoundCloudSourceConfig,
): Promise<SoundCloudFullSource> => {
	const client = await createSoundCloudClient({
		appName: config.appName,
		version: config.version,
		contact: config.contact,
		...(config.clientId != null ? { clientId: config.clientId } : {}),
		...(config.requestsPerSecond != null ? { requestsPerSecond: config.requestsPerSecond } : {}),
		...(config.burstSize != null ? { burstSize: config.burstSize } : {}),
		...(config.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
	});

	return buildFullSource(client);
};

// Backwards-compatible factory that returns metadata-only source
export const createSoundCloudSource = async (
	config: SoundCloudSourceConfig,
): Promise<MetadataSource> => createSoundCloudFullSource(config);
