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
		const data = JSON.parse(line) as {
			id: string;
			title: string;
			uploader?: string;
			album?: string;
			duration?: number;
			thumbnail?: string;
		};
		entries.push({
			id: data.id,
			title: data.title,
			...(data.uploader != null ? { uploader: data.uploader } : {}),
			...(data.album != null ? { album: data.album } : {}),
			...(data.duration != null ? { duration: data.duration } : {}),
			...(data.thumbnail != null ? { thumbnail: data.thumbnail } : {}),
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
		const data = JSON.parse(line) as {
			id: string;
			title: string;
			uploader?: string;
			album?: string;
			duration?: number;
			thumbnail?: string;
			playlist_id?: string;
			playlist_title?: string;
			playlist_uploader?: string;
		};
		if (data.playlist_id) albumId = data.playlist_id;
		if (data.playlist_title) albumTitle = data.playlist_title;
		if (data.playlist_uploader) albumArtist = data.playlist_uploader;
		if (data.thumbnail && !albumThumbnail) albumThumbnail = data.thumbnail;
		entries.push({
			id: data.id,
			title: data.title,
			...(data.uploader != null ? { uploader: data.uploader } : {}),
			...(data.album != null ? { album: data.album } : {}),
			...(data.duration != null ? { duration: data.duration } : {}),
			...(data.thumbnail != null ? { thumbnail: data.thumbnail } : {}),
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
		const data = JSON.parse(line) as {
			id: string;
			title: string;
			uploader?: string;
			album?: string;
			duration?: number;
			thumbnail?: string;
			playlist_id?: string;
			playlist_title?: string;
		};
		if (data.playlist_id) playlistId = data.playlist_id;
		if (data.playlist_title) playlistTitle = data.playlist_title;
		entries.push({
			id: data.id,
			title: data.title,
			...(data.uploader != null ? { uploader: data.uploader } : {}),
			...(data.album != null ? { album: data.album } : {}),
			...(data.duration != null ? { duration: data.duration } : {}),
			...(data.thumbnail != null ? { thumbnail: data.thumbnail } : {}),
		});
	}

	return {
		id: playlistId,
		title: playlistTitle,
		entries,
	};
}
