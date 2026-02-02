import { createRateLimiter, type RateLimiterStats } from "../rate-limiter.js";
import {
	PlaylistSchema,
	PlaylistSearchResultSchema,
	TrackSchema,
	type Playlist,
	type Track,
} from "./schemas.js";

export type SoundCloudClientConfig = {
	readonly appName: string;
	readonly version: string;
	readonly contact: string;
	readonly clientId?: string;
	readonly requestsPerSecond?: number;
	readonly burstSize?: number;
	readonly maxRetries?: number;
};

export type SoundCloudClient = {
	readonly searchPlaylists: (
		query: string,
		limit?: number,
	) => Promise<readonly Playlist[]>;
	readonly getTrack: (trackId: number) => Promise<Track>;
	readonly getPlaylist: (playlistId: number) => Promise<Playlist>;
	readonly getPlaylistWithFullTracks: (playlistId: number) => Promise<Playlist>;
	readonly getClientId: () => string | null;
	readonly getStats: () => RateLimiterStats;
};

const extractClientId = async (): Promise<string> => {
	const homepage = await fetch("https://soundcloud.com").then((r) => r.text());

	const jsUrls =
		homepage.match(
			/https:\/\/a-v2\.sndcdn\.com\/assets\/[0-9]+-[a-f0-9]+\.js/g,
		) ?? [];

	for (const url of jsUrls.slice(0, 15)) {
		const js = await fetch(url).then((r) => r.text());
		const match = js.match(/client_id:"([a-zA-Z0-9]+)"/);
		if (match?.[1]) {
			return match[1];
		}
	}

	throw new Error("Could not extract SoundCloud client_id from JS bundles");
};

export const createSoundCloudClient = async (
	config: SoundCloudClientConfig,
): Promise<SoundCloudClient> => {
	const {
		appName,
		version,
		contact,
		clientId: providedClientId,
		requestsPerSecond = 2,
		burstSize = 5,
		maxRetries = 3,
	} = config;

	const clientId = providedClientId ?? (await extractClientId());

	const baseUrl = "https://api-v2.soundcloud.com";
	const userAgent = `${appName}/${version} (${contact})`;

	const rateLimiter = createRateLimiter({
		requestsPerSecond,
		burstSize,
		maxRetries,
		baseBackoffMs: 1000,
	});

	const request = async (
		endpoint: string,
		params: Record<string, string | number> = {},
		retryCount = 0,
	): Promise<unknown> => {
		await rateLimiter.acquire();

		const searchParams = new URLSearchParams({
			client_id: clientId,
			...Object.fromEntries(
				Object.entries(params).map(([k, v]) => [k, String(v)]),
			),
		});

		const url = `${baseUrl}${endpoint}?${searchParams}`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": userAgent,
				Accept: "application/json",
			},
		});

		if (response.status === 429) {
			if (retryCount >= maxRetries) {
				throw new Error(`SoundCloud rate limited after ${maxRetries} retries`);
			}

			rateLimiter.onRateLimited();
			const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
			await new Promise((r) => setTimeout(r, backoffMs));
			return request(endpoint, params, retryCount + 1);
		}

		if (!response.ok) {
			throw new Error(
				`SoundCloud API error: ${response.status} ${response.statusText}`,
			);
		}

		return response.json() as Promise<unknown>;
	};

	return {
		searchPlaylists: async (query: string, limit = 20) => {
			const data = await request("/search/albums", { q: query, limit });
			const result = PlaylistSearchResultSchema.parse(data);
			return result.collection;
		},

		getTrack: async (trackId: number) => {
			const data = await request(`/tracks/${trackId}`);
			return TrackSchema.parse(data);
		},

		getPlaylist: async (playlistId: number) => {
			const data = await request(`/playlists/${playlistId}`);
			return PlaylistSchema.parse(data);
		},

		getPlaylistWithFullTracks: async (playlistId: number) => {
			const data = await request(`/playlists/${playlistId}`);
			const parsed = PlaylistSchema.parse(data);

			// Fetch full track details for tracks missing info (duration=30000 indicates stub)
			if (parsed.tracks && parsed.tracks.length > 0) {
				const fullTracks: Track[] = [];
				for (const track of parsed.tracks) {
					if (!track.title || !track.duration || track.duration === 30000) {
						try {
							const fullTrack = await request(`/tracks/${track.id}`);
							fullTracks.push(TrackSchema.parse(fullTrack));
						} catch {
							fullTracks.push(track);
						}
					} else {
						fullTracks.push(track);
					}
				}
				return { ...parsed, tracks: fullTracks };
			}

			return parsed;
		},

		getClientId: () => clientId,

		getStats: () => rateLimiter.getStats(),
	};
};
