import { useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import {
	playlistTrackToNowPlaying,
	shuffleArray,
} from "@/web/shared/lib/now-playing-utils";
import { NowPlayingProvider, useNowPlaying } from "./now-playing-context";
import { NowPlayingSkeleton } from "@/web/shared/ui/skeleton";
import {
	Artwork,
	TrackInfo,
	ProgressBar,
	Controls,
	Actions,
	InfoButton,
	BookmarkButton,
	SleepButton,
	UpNext,
	TrackInfoModalWrapper,
} from "./now-playing-primitives";

export function PlaylistNowPlaying({
	playlistId,
	startIndex,
	shuffle,
}: {
	readonly playlistId: string;
	readonly startIndex: number;
	readonly shuffle: boolean;
}) {
	const contextKey = `playlist:${playlistId}`;

	return (
		<NowPlayingProvider
			contextKey={contextKey}
			context={{ type: "playlist", playlistId }}
		>
			<PlaylistContent
				playlistId={playlistId}
				contextKey={contextKey}
				startIndex={startIndex}
				shuffle={shuffle}
			/>
		</NowPlayingProvider>
	);
}

function PlaylistContent({
	playlistId,
	contextKey,
	startIndex,
	shuffle,
}: {
	readonly playlistId: string;
	readonly contextKey: string;
	readonly startIndex: number;
	readonly shuffle: boolean;
}) {
	const { startPlayback, currentTrack, isReady } = useNowPlaying();

	const playlistQuery = trpc.playlist.getTracks.useQuery(
		{ id: playlistId },
		{ enabled: true },
	);

	useEffect(() => {
		if (playlistQuery.error) {
			toast.error(`Failed to load playlist: ${playlistQuery.error.message}`);
		}
	}, [playlistQuery.error]);

	useEffect(() => {
		if (!playlistQuery.data) return;
		const ordered = playlistQuery.data.map(playlistTrackToNowPlaying);
		const newTracks = shuffle ? shuffleArray(ordered) : ordered;
		const idx = shuffle ? 0 : startIndex;
		startPlayback(newTracks, idx);
	}, [contextKey, playlistQuery.data, startPlayback, shuffle, startIndex]);

	if (playlistQuery.isLoading) {
		return <NowPlayingSkeleton />;
	}

	if (!isReady) {
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
			<TrackInfo />
			<ProgressBar />
			<Controls />
			<Actions>
				{currentTrack.capabilities.explain && <InfoButton />}
				{currentTrack.capabilities.bookmark && <BookmarkButton />}
				{currentTrack.capabilities.sleep && <SleepButton />}
			</Actions>
			<UpNext />
			<TrackInfoModalWrapper />
		</div>
	);
}
