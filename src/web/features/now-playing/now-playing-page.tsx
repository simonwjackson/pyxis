import { RadioNowPlaying } from "./radio-now-playing";
import { AlbumNowPlaying } from "./album-now-playing";
import { PlaylistNowPlaying } from "./playlist-now-playing";

type NowPlayingSearch = {
	readonly station?: string;
	readonly playlist?: string;
	readonly album?: string;
	readonly startIndex?: number;
	readonly shuffle?: string;
};

export function NowPlayingPage({ search }: { readonly search: NowPlayingSearch }) {
	const startIndex = search.startIndex ?? 0;
	const shuffle = search.shuffle === "1";

	if (search.album) {
		return (
			<AlbumNowPlaying
				albumId={search.album}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		)
	}

	if (search.playlist) {
		return (
			<PlaylistNowPlaying
				playlistId={search.playlist}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		)
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
	)
}
