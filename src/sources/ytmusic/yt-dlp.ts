import { spawn } from "node:child_process";

type YtDlpTrackInfo = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly duration: number;
	readonly thumbnail: string | undefined;
	readonly url: string;
};

type YtDlpPlaylistEntry = {
	readonly id: string;
	readonly title: string;
	readonly uploader?: string;
	readonly album?: string;
	readonly duration?: number;
	readonly thumbnail?: string;
};

type YtDlpPlaylistInfo = {
	readonly id: string;
	readonly title: string;
	readonly entries: readonly YtDlpPlaylistEntry[];
};

function runYtDlp(args: readonly string[]): Promise<string> {
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
