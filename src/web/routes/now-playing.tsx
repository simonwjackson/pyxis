import { useSearch } from "@tanstack/react-router";
import { RadioNowPlaying } from "../components/now-playing/RadioNowPlaying";
import { AlbumNowPlaying } from "../components/now-playing/AlbumNowPlaying";
import { PlaylistNowPlaying } from "../components/now-playing/PlaylistNowPlaying";

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as {
		station?: string;
		playlist?: string;
		album?: string;
		startIndex?: number;
		shuffle?: string;
	};

	const startIndex = search.startIndex ?? 0;
	const shuffle = search.shuffle === "1";

	if (search.album) {
		return (
			<AlbumNowPlaying
				albumId={search.album}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		);
	}

	if (search.playlist) {
		return (
			<PlaylistNowPlaying
				playlistId={search.playlist}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		);
	}

	if (search.station) {
		return <RadioNowPlaying radioId={search.station} />;
	}

	return (
		<div className="flex-1 flex items-center justify-center p-4">
			<p className="text-[var(--color-text-dim)]">
				Select a playlist to start listening
			</p>
		</div>
	);
}
