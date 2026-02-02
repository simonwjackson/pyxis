import { useEffect } from "react";
import { trpc } from "../../lib/trpc";
import {
	albumTrackToNowPlaying,
	shuffleArray,
} from "../../lib/now-playing-utils";
import { NowPlayingProvider, useNowPlaying } from "./NowPlayingContext";
import { NowPlayingSkeleton } from "../ui/skeleton";
import {
	Artwork,
	TrackInfo,
	ProgressBar,
	Controls,
	PreviousButton,
	BoundedSkipButton,
	Actions,
	InfoButton,
	BookmarkButton,
	SleepButton,
	Tracklist,
	TrackInfoModalWrapper,
} from "./NowPlayingPrimitives";

export function AlbumNowPlaying({
	albumId,
	startIndex,
	shuffle,
}: {
	readonly albumId: string;
	readonly startIndex: number;
	readonly shuffle: boolean;
}) {
	const contextKey = `album:${albumId}`;

	return (
		<NowPlayingProvider
			contextKey={contextKey}
			context={{ type: "album", albumId }}
		>
			<AlbumContent
				albumId={albumId}
				contextKey={contextKey}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		</NowPlayingProvider>
	);
}

function AlbumContent({
	albumId,
	contextKey,
	startIndex,
	shuffle,
}: {
	readonly albumId: string;
	readonly contextKey: string;
	readonly startIndex: number;
	readonly shuffle: boolean;
}) {
	const { startPlayback, setAlbumMeta, currentTrack, albumMeta } =
		useNowPlaying();

	const albumTracksQuery = trpc.library.albumTracks.useQuery(
		{ albumId },
		{ enabled: true },
	);
	const albumsQuery = trpc.library.albums.useQuery(undefined, {
		enabled: true,
	});

	// Force fresh data when albumId changes (prevents stale cache race)
	const utils = trpc.useUtils();
	useEffect(() => {
		utils.library.albumTracks.invalidate({ albumId });
	}, [albumId, utils]);

	useEffect(() => {
		if (!albumTracksQuery.data || !albumsQuery.data) return;
		const albumInfo = albumsQuery.data.find((a) => a.id === albumId);
		if (albumInfo) {
			setAlbumMeta({
				title: albumInfo.title,
				artist: albumInfo.artist,
				artworkUrl: albumInfo.artworkUrl,
			});
		}
		const ordered = albumTracksQuery.data.map((t) =>
			albumTrackToNowPlaying(
				t,
				albumInfo?.title ?? "",
				albumInfo?.artworkUrl ?? null,
			),
		);
		const newTracks = shuffle ? shuffleArray(ordered) : ordered;
		const idx = shuffle ? 0 : startIndex;
		startPlayback(newTracks, idx);
	}, [
		contextKey,
		albumTracksQuery.data,
		albumsQuery.data,
		albumId,
		startPlayback,
		shuffle,
		startIndex,
		setAlbumMeta,
	]);

	if (albumTracksQuery.isLoading || albumsQuery.isLoading) {
		return <NowPlayingSkeleton />;
	}

	if (!currentTrack) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">No tracks available</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
			<Artwork />
			<TrackInfo albumLabel={albumMeta?.title} />
			<ProgressBar />
			<Controls before={<PreviousButton />} skip={<BoundedSkipButton />} />
			<Actions>
				{currentTrack.capabilities.explain && <InfoButton />}
				{currentTrack.capabilities.bookmark && <BookmarkButton />}
				{currentTrack.capabilities.sleep && <SleepButton />}
			</Actions>
			<Tracklist />
			<TrackInfoModalWrapper />
		</div>
	);
}
