import { useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { radioTrackToNowPlaying } from "../../lib/now-playing-utils";
import { NowPlayingProvider, useNowPlaying } from "./NowPlayingContext";
import { NowPlayingSkeleton } from "../ui/skeleton";
import {
	Artwork,
	TrackInfo,
	ProgressBar,
	Controls,
	FeedbackButtons,
	LikeButton,
	Actions,
	InfoButton,
	BookmarkButton,
	SleepButton,
	UpNext,
	TrackInfoModalWrapper,
} from "./NowPlayingPrimitives";

export function RadioNowPlaying({ radioId }: { readonly radioId: string }) {
	const contextKey = `radio:${radioId}`;

	return (
		<NowPlayingProvider
			contextKey={contextKey}
			context={{ type: "radio", seedId: radioId }}
			radioId={radioId}
		>
			<RadioContent radioId={radioId} contextKey={contextKey} />
		</NowPlayingProvider>
	);
}

function RadioContent({
	radioId,
	contextKey,
}: {
	readonly radioId: string;
	readonly contextKey: string;
}) {
	const { startPlayback, currentTrack } = useNowPlaying();

	const radioQuery = trpc.radio.getTracks.useQuery(
		{ id: radioId, quality: "high" },
		{ enabled: true },
	);

	// Log radio query lifecycle
	useEffect(() => {
		console.log("[now-playing] radioQuery changed", {
			status: radioQuery.status,
			fetchStatus: radioQuery.fetchStatus,
			dataLength: radioQuery.data?.length,
			error: radioQuery.error?.message,
		});
	}, [
		radioQuery.status,
		radioQuery.fetchStatus,
		radioQuery.data,
		radioQuery.error,
	]);

	useEffect(() => {
		if (radioQuery.error) {
			toast.error(`Failed to load station: ${radioQuery.error.message}`);
		}
	}, [radioQuery.error]);

	useEffect(() => {
		if (!radioQuery.data) return;
		const newTracks = radioQuery.data.map(radioTrackToNowPlaying);
		startPlayback(newTracks);
	}, [contextKey, radioQuery.data, startPlayback]);

	if (radioQuery.isLoading) {
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
			<Controls
				before={<FeedbackButtons />}
				after={<LikeButton />}
			/>
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
