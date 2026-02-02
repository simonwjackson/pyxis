import { createFileRoute } from "@tanstack/react-router";
import { RadioNowPlaying } from "./-radio-now-playing";
import { AlbumNowPlaying } from "./-album-now-playing";
import { PlaylistNowPlaying } from "./-playlist-now-playing";

function NowPlayingPage() {
	const search = Route.useSearch();

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

export const Route = createFileRoute("/now-playing/")({
	component: NowPlayingPage,
	validateSearch: (search: Record<string, unknown>) => ({
		station: typeof search["station"] === "string" ? search["station"] : undefined,
		playlist: typeof search["playlist"] === "string" ? search["playlist"] : undefined,
		album: typeof search["album"] === "string" ? search["album"] : undefined,
		startIndex: typeof search["startIndex"] === "number" ? search["startIndex"] : undefined,
		shuffle: typeof search["shuffle"] === "string" ? search["shuffle"] : undefined,
	}),
});
