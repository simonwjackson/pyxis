/**
 * @module youtube
 * YouTube source for chapter-based album playback.
 * Treats YouTube videos with chapter markers as albums where each chapter is a track.
 */

import type {
	Source,
	CanonicalTrack,
	CanonicalAlbum,
	SearchResult,
} from "../types.js";
import * as ytdlp from "../ytmusic/yt-dlp.js";

/**
 * YouTube URL patterns for video ID extraction.
 * Matches youtube.com/watch, youtu.be, and youtube.com/embed URLs.
 */
const YOUTUBE_URL_PATTERNS = [
	/(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
	/youtu\.be\/([a-zA-Z0-9_-]{11})/,
	/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
] as const;

/**
 * Extracts a YouTube video ID from a URL string.
 *
 * @param query - Potential YouTube URL
 * @returns Video ID if found, null otherwise
 */
export function extractVideoId(query: string): string | null {
	for (const pattern of YOUTUBE_URL_PATTERNS) {
		const match = query.match(pattern);
		if (match?.[1]) return match[1];
	}
	return null;
}

/**
 * Encodes a chapter track ID from its components.
 * Format: `videoId@startTime-endTime`
 *
 * @param videoId - YouTube video ID
 * @param startTime - Chapter start time in seconds
 * @param endTime - Chapter end time in seconds
 * @returns Encoded track ID string
 */
export function encodeChapterTrackId(videoId: string, startTime: number, endTime: number): string {
	return `${videoId}@${String(startTime)}-${String(endTime)}`;
}

/**
 * Decodes a chapter track ID into its components.
 * Expected format: `videoId@startTime-endTime`
 *
 * @param trackId - Encoded chapter track ID
 * @returns Parsed components or null if format is invalid
 */
export function decodeChapterTrackId(trackId: string): {
	videoId: string;
	startTime: number;
	endTime: number;
} | null {
	const atIndex = trackId.indexOf("@");
	if (atIndex === -1) return null;

	const videoId = trackId.slice(0, atIndex);
	const timePart = trackId.slice(atIndex + 1);
	const dashIndex = timePart.indexOf("-");
	if (dashIndex === -1) return null;

	const startTime = Number(timePart.slice(0, dashIndex));
	const endTime = Number(timePart.slice(dashIndex + 1));

	if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
	if (!videoId) return null;

	return { videoId, startTime, endTime };
}

/**
 * Creates a YouTube source instance.
 * Supports search (URL detection), album (chapter listing), and streaming capabilities.
 *
 * @returns A Source implementation for YouTube chapter-based albums
 */
export function createYouTubeSource(): Source {
	return {
		type: "youtube",
		name: "YouTube",

		async search(query: string): Promise<SearchResult> {
			const videoId = extractVideoId(query);
			if (!videoId) return { tracks: [], albums: [] };

			try {
				const info = await ytdlp.getVideoInfo(videoId);
				const album = videoInfoToAlbum(info);
				return { tracks: [], albums: [album] };
			} catch {
				return { tracks: [], albums: [] };
			}
		},

		async getAlbumTracks(albumId: string) {
			const info = await ytdlp.getVideoInfo(albumId);
			const album = videoInfoToAlbum(info);
			return { album, tracks: album.tracks };
		},

		async getStreamUrl(trackId: string): Promise<string> {
			// Strip the @start-end suffix to get the base video ID
			const decoded = decodeChapterTrackId(trackId);
			const videoId = decoded ? decoded.videoId : trackId;
			return ytdlp.getAudioUrl(videoId);
		},
	};
}

/**
 * Converts yt-dlp video info into a CanonicalAlbum.
 * Each chapter becomes a track; if no chapters, the whole video is a single track.
 */
function videoInfoToAlbum(info: ytdlp.YtDlpVideoInfo): CanonicalAlbum {
	const tracks: CanonicalTrack[] = info.chapters
		? info.chapters.map((chapter, index) => ({
				id: encodeChapterTrackId(info.id, chapter.start_time, chapter.end_time),
				title: chapter.title,
				artist: info.uploader,
				album: info.title,
				duration: chapter.end_time - chapter.start_time,
				sourceId: {
					source: "youtube" as const,
					id: encodeChapterTrackId(info.id, chapter.start_time, chapter.end_time),
				},
				...(info.thumbnail != null ? { artworkUrl: info.thumbnail } : {}),
				trackIndex: index,
			}))
		: [
				{
					id: info.id,
					title: info.title,
					artist: info.uploader,
					album: info.title,
					duration: info.duration,
					sourceId: { source: "youtube" as const, id: info.id },
					...(info.thumbnail != null ? { artworkUrl: info.thumbnail } : {}),
				},
			];

	return {
		id: info.id,
		title: info.title,
		artist: info.uploader,
		tracks,
		sourceIds: [{ source: "youtube" as const, id: info.id }],
		...(info.thumbnail != null ? { artworkUrl: info.thumbnail } : {}),
	};
}
