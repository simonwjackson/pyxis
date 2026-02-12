/**
 * @module yt-dlp
 * Wrapper around the yt-dlp CLI tool for YouTube Music operations.
 * Provides functions for extracting audio URLs, track info, and playlist data.
 * Includes proxy rotation to bypass IP-based bot detection on cloud servers.
 */

import { spawn } from "node:child_process";

/**
 * Track information extracted from yt-dlp JSON output.
 * Contains metadata and direct audio URL for a single video.
 */
type YtDlpTrackInfo = {
	/** YouTube video ID */
	readonly id: string;
	/** Track title */
	readonly title: string;
	/** Artist or uploader name */
	readonly artist: string;
	/** Album name if available */
	readonly album: string;
	/** Duration in seconds */
	readonly duration: number;
	/** URL to thumbnail image */
	readonly thumbnail: string | undefined;
	/** Direct audio stream URL */
	readonly url: string;
};

/**
 * Single entry from a playlist extraction.
 * Represents minimal track metadata from flat playlist extraction.
 */
type YtDlpPlaylistEntry = {
	/** YouTube video ID */
	readonly id: string;
	/** Track title */
	readonly title: string;
	/** Channel/uploader name */
	readonly uploader?: string;
	/** Album name if tagged */
	readonly album?: string;
	/** Duration in seconds */
	readonly duration?: number;
	/** Thumbnail URL */
	readonly thumbnail?: string;
};

/**
 * Complete playlist information including all entries.
 * Returned by playlist extraction operations.
 */
type YtDlpPlaylistInfo = {
	/** YouTube playlist ID */
	readonly id: string;
	/** Playlist title */
	readonly title: string;
	/** All tracks in the playlist */
	readonly entries: readonly YtDlpPlaylistEntry[];
};

// --- Proxy rotation ---

type ProxyEntry = { readonly url: string; failures: number };

let proxyList: ProxyEntry[] = [];
let proxyFetchedAt = 0;
const PROXY_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_PROXY_FAILURES = 3;
const MAX_RETRIES = 3;

async function fetchProxyList(): Promise<readonly string[]> {
	try {
		const res = await fetch("https://free-proxy-list.net/");
		const html = await res.text();
		// Parse the HTML table for proxy entries
		const proxies: string[] = [];
		// Match table rows: IP, port, country code, country, anonymity, google, https
		// Cells may have class attributes like class='hm' or class='hx'
		const rowRegex = /<tr><td>(\d+\.\d+\.\d+\.\d+)<\/td><td>(\d+)<\/td><td[^>]*>[^<]*<\/td><td[^>]*>[^<]*<\/td><td[^>]*>(anonymous|elite proxy)<\/td><td[^>]*>[^<]*<\/td><td[^>]*>(yes)<\/td>/gi;
		let match: RegExpExecArray | null;
		while ((match = rowRegex.exec(html)) !== null) {
			proxies.push(`http://${match[1]}:${match[2]}`);
		}
		return proxies;
	} catch {
		return [];
	}
}

async function getProxies(): Promise<ProxyEntry[]> {
	const now = Date.now();
	if (proxyList.length === 0 || now - proxyFetchedAt > PROXY_REFRESH_INTERVAL) {
		const urls = await fetchProxyList();
		// Shuffle the list so we don't always hit the same proxies
		const shuffled = [...urls].sort(() => Math.random() - 0.5);
		proxyList = shuffled.map((url) => ({ url, failures: 0 }));
		proxyFetchedAt = now;
	}
	// Filter out proxies that have failed too many times
	return proxyList.filter((p) => p.failures < MAX_PROXY_FAILURES);
}

function markProxyFailed(proxyUrl: string): void {
	const entry = proxyList.find((p) => p.url === proxyUrl);
	if (entry) entry.failures++;
}

function runYtDlpRaw(args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn("yt-dlp", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				reject(
					new Error(
						`yt-dlp exited with code ${String(code)}: ${stderr.trim()}`,
					),
				);
			}
		});
		proc.on("error", reject);
	});
}

async function runYtDlp(args: readonly string[]): Promise<string> {
	// First try without proxy (works on residential IPs)
	try {
		return await runYtDlpRaw(args);
	} catch (directError) {
		const errMsg = directError instanceof Error ? directError.message : "";
		// Only use proxies for bot detection / sign-in errors
		if (!errMsg.includes("Sign in") && !errMsg.includes("bot")) {
			throw directError;
		}
	}

	// Proxy fallback with rotation
	const proxies = await getProxies();
	let lastError: unknown;
	for (let i = 0; i < Math.min(MAX_RETRIES, proxies.length); i++) {
		const proxy = proxies[i];
		if (!proxy) continue;
		try {
			const result = await runYtDlpRaw(["--proxy", proxy.url, ...args]);
			return result;
		} catch (err) {
			markProxyFailed(proxy.url);
			lastError = err;
		}
	}
	throw lastError ?? new Error("All proxies failed");
}

/**
 * Chapter information from yt-dlp JSON output.
 */
export type YtDlpChapter = {
	readonly title: string;
	readonly start_time: number;
	readonly end_time: number;
};

/**
 * Full video metadata from yt-dlp, including chapter markers.
 */
export type YtDlpVideoInfo = {
	readonly id: string;
	readonly title: string;
	readonly uploader: string;
	readonly thumbnail?: string;
	readonly duration: number;
	readonly chapters: readonly YtDlpChapter[] | null;
};

/**
 * Fetches full video metadata including chapter markers.
 * Uses yt-dlp to dump JSON info for a YouTube video.
 *
 * @param videoId - YouTube video ID (e.g., "6uJ0eRFQszo")
 * @returns Video metadata including chapters array (null if no chapters)
 * @throws Error if yt-dlp fails or video is unavailable
 */
export async function getVideoInfo(videoId: string): Promise<YtDlpVideoInfo> {
	const output = await runYtDlp([
		"--dump-json",
		"--no-playlist",
		`https://www.youtube.com/watch?v=${videoId}`,
	]);
	const data = JSON.parse(output) as {
		id?: string;
		title?: string;
		uploader?: string;
		thumbnail?: string;
		duration?: number;
		chapters?: readonly { title: string; start_time: number; end_time: number }[] | null;
	};
	return {
		id: typeof data.id === "string" ? data.id : videoId,
		title: typeof data.title === "string" ? data.title : "Unknown",
		uploader: typeof data.uploader === "string" ? data.uploader : "Unknown",
		...(typeof data.thumbnail === "string" ? { thumbnail: data.thumbnail } : {}),
		duration: typeof data.duration === "number" ? data.duration : 0,
		chapters: Array.isArray(data.chapters) && data.chapters.length > 0 ? data.chapters : null,
	};
}

/**
 * Extracts the direct audio stream URL for a YouTube Music video.
 * Uses yt-dlp to resolve the best available audio format.
 *
 * @param videoId - YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns Direct URL to the audio stream (expires after some time)
 * @throws Error if yt-dlp fails or video is unavailable
 */
export async function getAudioUrl(videoId: string): Promise<string> {
	const output = await runYtDlp([
		"--format",
		"bestaudio",
		"--get-url",
		"--no-playlist",
		`https://music.youtube.com/watch?v=${videoId}`,
	]);
	return output;
}

/**
 * Extracts the direct audio stream URL for a regular YouTube video.
 * Uses youtube.com (not music.youtube.com) for videos that may not be
 * available on YouTube Music.
 *
 * @param videoId - YouTube video ID (e.g., "6uJ0eRFQszo")
 * @returns Direct URL to the audio stream (expires after some time)
 * @throws Error if yt-dlp fails or video is unavailable
 */
export async function getYouTubeAudioUrl(videoId: string): Promise<string> {
	const output = await runYtDlp([
		"--format",
		"bestaudio",
		"--get-url",
		"--no-playlist",
		`https://www.youtube.com/watch?v=${videoId}`,
	]);
	return output;
}

/**
 * Fetches complete track metadata for a YouTube Music video.
 * Includes title, artist, album, duration, thumbnail, and stream URL.
 *
 * @param videoId - YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns Full track information including audio URL
 * @throws Error if yt-dlp fails or video is unavailable
 */
export async function getTrackInfo(
	videoId: string,
): Promise<YtDlpTrackInfo> {
	const output = await runYtDlp([
		"--dump-json",
		"--no-playlist",
		`https://music.youtube.com/watch?v=${videoId}`,
	]);
	const data = JSON.parse(output) as {
		id: string;
		title: string;
		artist?: string;
		uploader?: string;
		album?: string;
		duration?: number;
		thumbnail?: string;
		url?: string;
	};
	return {
		id: data.id,
		title: data.title,
		artist: data.artist ?? data.uploader ?? "Unknown",
		album: data.album ?? "",
		duration: data.duration ?? 0,
		thumbnail: data.thumbnail,
		url: data.url ?? "",
	};
}

/**
 * Searches YouTube Music for tracks matching the query.
 * Uses yt-dlp's ytsearch prefix for video search.
 *
 * @param query - Search query string
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Array of track entries matching the search query
 * @throws Error if yt-dlp fails
 */
export async function searchYtMusic(
	query: string,
	maxResults = 10,
): Promise<readonly YtDlpPlaylistEntry[]> {
	const output = await runYtDlp([
		"--dump-json",
		"--flat-playlist",
		"--no-download",
		`ytsearch${String(maxResults)}:${query}`,
	]);

	const lines = output.split("\n").filter((line) => line.trim().length > 0);
	const entries: YtDlpPlaylistEntry[] = [];

	for (const line of lines) {
		const data: unknown = JSON.parse(line);
		if (typeof data !== "object" || data === null) continue;
		const record = data as Record<string, unknown>;
		const id = typeof record.id === "string" ? record.id : undefined;
		const title = typeof record.title === "string" ? record.title : undefined;
		// Skip entries without valid id or title (unavailable/private videos)
		if (!id || !title) continue;
		entries.push({
			id,
			title,
			...(typeof record.uploader === "string" ? { uploader: record.uploader } : {}),
			...(typeof record.album === "string" ? { album: record.album } : {}),
			...(typeof record.duration === "number" ? { duration: record.duration } : {}),
			...(typeof record.thumbnail === "string" ? { thumbnail: record.thumbnail } : {}),
		});
	}

	return entries;
}

/**
 * Extracts all tracks from a YouTube Music album.
 * Returns album metadata along with the track listing.
 *
 * @param albumUrl - Full YouTube Music album URL
 * @returns Album metadata (id, title, artist, thumbnail) and array of track entries
 * @throws Error if yt-dlp fails or album is unavailable
 */
export async function getAlbumEntries(
	albumUrl: string,
): Promise<{
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly entries: readonly YtDlpPlaylistEntry[];
	readonly thumbnail?: string;
}> {
	const output = await runYtDlp([
		"--dump-json",
		"--flat-playlist",
		albumUrl,
	]);

	const lines = output.split("\n").filter((line) => line.trim().length > 0);
	const entries: YtDlpPlaylistEntry[] = [];
	let albumId = "";
	let albumTitle = "Unknown Album";
	let albumArtist = "Unknown Artist";
	let albumThumbnail: string | undefined;

	for (const line of lines) {
		const data: unknown = JSON.parse(line);
		if (typeof data !== "object" || data === null) continue;
		const record = data as Record<string, unknown>;
		if (typeof record.playlist_id === "string") albumId = record.playlist_id;
		if (typeof record.playlist_title === "string") albumTitle = record.playlist_title;
		if (typeof record.playlist_uploader === "string") albumArtist = record.playlist_uploader;
		if (typeof record.thumbnail === "string" && !albumThumbnail) albumThumbnail = record.thumbnail;
		const id = typeof record.id === "string" ? record.id : undefined;
		const title = typeof record.title === "string" ? record.title : undefined;
		// Skip entries without valid id or title (unavailable/private videos)
		if (!id || !title) continue;
		entries.push({
			id,
			title,
			...(typeof record.uploader === "string" ? { uploader: record.uploader } : {}),
			...(typeof record.album === "string" ? { album: record.album } : {}),
			...(typeof record.duration === "number" ? { duration: record.duration } : {}),
			...(typeof record.thumbnail === "string" ? { thumbnail: record.thumbnail } : {}),
		});
	}

	return {
		id: albumId,
		title: albumTitle,
		artist: albumArtist,
		entries,
		...(albumThumbnail != null ? { thumbnail: albumThumbnail } : {}),
	};
}

/**
 * Extracts all tracks from a YouTube Music playlist.
 * Returns playlist metadata and complete track listing.
 *
 * @param playlistUrl - Full YouTube Music playlist URL or playlist ID
 * @returns Playlist info containing id, title, and array of track entries
 * @throws Error if yt-dlp fails or playlist is unavailable/private
 */
export async function getPlaylistEntries(
	playlistUrl: string,
): Promise<YtDlpPlaylistInfo> {
	const output = await runYtDlp([
		"--dump-json",
		"--flat-playlist",
		playlistUrl,
	]);

	// yt-dlp outputs one JSON object per line for flat playlist
	const lines = output.split("\n").filter((line) => line.trim().length > 0);
	const entries: YtDlpPlaylistEntry[] = [];
	let playlistId = "";
	let playlistTitle = "YouTube Music Playlist";

	for (const line of lines) {
		const data: unknown = JSON.parse(line);
		if (typeof data !== "object" || data === null) continue;
		const record = data as Record<string, unknown>;
		if (typeof record.playlist_id === "string") playlistId = record.playlist_id;
		if (typeof record.playlist_title === "string") playlistTitle = record.playlist_title;
		const id = typeof record.id === "string" ? record.id : undefined;
		const title = typeof record.title === "string" ? record.title : undefined;
		// Skip entries without valid id or title (unavailable/private videos)
		if (!id || !title) continue;
		entries.push({
			id,
			title,
			...(typeof record.uploader === "string" ? { uploader: record.uploader } : {}),
			...(typeof record.album === "string" ? { album: record.album } : {}),
			...(typeof record.duration === "number" ? { duration: record.duration } : {}),
			...(typeof record.thumbnail === "string" ? { thumbnail: record.thumbnail } : {}),
		});
	}

	return {
		id: playlistId,
		title: playlistTitle,
		entries,
	};
}
