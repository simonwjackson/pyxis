import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useRef,
	useMemo,
	type ReactNode,
} from "react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import type { NowPlayingTrack } from "@/web/shared/lib/now-playing-utils";
import { tracksToQueuePayload } from "@/web/shared/lib/now-playing-utils";

export type PlaybackMode =
	| { readonly type: "album"; readonly albumId: string }
	| { readonly type: "radio"; readonly seedId: string }
	| { readonly type: "playlist"; readonly playlistId: string };

type NowPlayingContextValue = {
	readonly tracks: readonly NowPlayingTrack[];
	readonly trackIndex: number;
	readonly currentTrack: NowPlayingTrack | undefined;
	readonly handleSkip: () => void;
	readonly handlePrevious: () => void;
	readonly handleJumpToTrack: (index: number) => void;
	readonly handleLike: () => void;
	readonly handleDislike: () => void;
	readonly handleSleep: () => void;
	readonly handleBookmark: () => void;
	readonly showTrackInfo: boolean;
	readonly setShowTrackInfo: (show: boolean) => void;
	readonly albumMeta: {
		readonly title: string;
		readonly artist: string;
		readonly artworkUrl: string | null;
	} | null;
	readonly setAlbumMeta: (
		meta: {
			readonly title: string;
			readonly artist: string;
			readonly artworkUrl: string | null;
		} | null,
	) => void;
	readonly isReady: boolean;
	readonly startPlayback: (
		newTracks: readonly NowPlayingTrack[],
		startIndex?: number,
	) => void;
};

const NowPlayingCtx = createContext<NowPlayingContextValue | null>(null);

export function useNowPlaying() {
	const ctx = useContext(NowPlayingCtx);
	if (!ctx) {
		throw new Error("useNowPlaying must be used within a NowPlaying.Provider");
	}
	return ctx;
}

type ProviderProps = {
	readonly contextKey: string;
	readonly context: PlaybackMode;
	readonly radioId?: string;
	readonly children: ReactNode;
};

export function NowPlayingProvider({
	contextKey,
	context,
	radioId,
	children,
}: ProviderProps) {
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const hasStartedRef = useRef(false);
	const activeContextRef = useRef(contextKey);
	const [tracks, setTracks] = useState<readonly NowPlayingTrack[]>([]);
	const [trackIndex, setTrackIndex] = useState(0);
	const [isReady, setIsReady] = useState(false);
	const [albumMeta, setAlbumMeta] = useState<{
		readonly title: string;
		readonly artist: string;
		readonly artworkUrl: string | null;
	} | null>(null);

	// Reset playback gate and clear stale state when switching context
	useEffect(() => {
		console.log("[now-playing] context switch reset", { contextKey });
		activeContextRef.current = contextKey;
		hasStartedRef.current = false;
		setIsReady(false);
		setTracks([]);
		setTrackIndex(0);
		setAlbumMeta(null);
	}, [contextKey]);

	// Subscribe to queue state to track current index
	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setTrackIndex(queueState.currentIndex);
		},
	});

	// Stable reference to play mutation
	const playMutationRef = useRef(playback.playMutation);
	playMutationRef.current = playback.playMutation;

	// Stable ref for context to avoid re-creating startPlayback on context object changes
	const contextRef = useRef(context);
	contextRef.current = context;

	const startPlayback = useCallback(
		(newTracks: readonly NowPlayingTrack[], startIndex = 0) => {
			if (newTracks.length === 0) return;
			if (contextKey !== activeContextRef.current) {
				console.log("[now-playing] skipping startPlayback for stale context", {
					contextKey,
					activeContext: activeContextRef.current,
				});
				return;
			}
			if (hasStartedRef.current) return;
			hasStartedRef.current = true;
			setTracks(newTracks);
			setIsReady(true);
			console.log("[now-playing] calling playMutation", {
				context: contextRef.current,
				trackCount: newTracks.length,
				firstTrackId: newTracks[0]?.id,
				contextKey,
				startIndex,
			});
			playMutationRef.current.mutate({
				tracks: tracksToQueuePayload(newTracks),
				context: contextRef.current,
				startIndex,
			});
		},
		[contextKey],
	);

	// Set station token on the playback context
	useEffect(() => {
		const token =
			context.type === "album"
				? context.albumId
				: context.type === "radio"
					? context.seedId
					: context.playlistId;
		playbackRef.current.setCurrentStationToken(token);
	}, [context]);

	const feedbackMutation = trpc.track.feedback.useMutation({
		onError(err) {
			toast.error(`Feedback failed: ${err.message}`);
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`Sleep failed: ${err.message}`);
		},
	});
	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
		onError(err) {
			toast.error(`Bookmark failed: ${err.message}`);
		},
	});

	useEffect(() => {
		if (playback.error) {
			toast.error(`Audio error: ${playback.error}`);
			playbackRef.current.clearError();
		}
	}, [playback.error]);

	const currentTrack = tracks[trackIndex];

	const handleSkip = useCallback(() => {
		if (context.type === "album") {
			const nextIndex = trackIndex + 1;
			if (nextIndex < tracks.length) {
				playbackRef.current.triggerJumpTo(nextIndex);
			} else {
				playbackRef.current.stop();
			}
		} else {
			playbackRef.current.triggerSkip();
		}
	}, [trackIndex, tracks, context.type]);

	const handlePrevious = useCallback(() => {
		if (trackIndex > 0) {
			playbackRef.current.triggerJumpTo(trackIndex - 1);
		}
	}, [trackIndex]);

	const handleJumpToTrack = useCallback((index: number) => {
		playbackRef.current.triggerJumpTo(index);
	}, []);

	const handleLike = useCallback(() => {
		if (!radioId || !currentTrack?.capabilities.feedback) return;
		feedbackMutation.mutate({
			radioId,
			id: currentTrack.id,
			positive: true,
		});
	}, [radioId, currentTrack, feedbackMutation]);

	const handleDislike = useCallback(() => {
		if (!radioId || !currentTrack?.capabilities.feedback) return;
		feedbackMutation.mutate({
			radioId,
			id: currentTrack.id,
			positive: false,
		});
		handleSkip();
	}, [radioId, currentTrack, feedbackMutation, handleSkip]);

	const handleSleep = useCallback(() => {
		if (!currentTrack?.capabilities.sleep) return;
		sleepMutation.mutate({ id: currentTrack.id });
		handleSkip();
	}, [currentTrack, sleepMutation, handleSkip]);

	const handleBookmark = useCallback(() => {
		if (!currentTrack?.capabilities.bookmark) return;
		bookmarkSongMutation.mutate({ id: currentTrack.id, type: "song" });
	}, [currentTrack, bookmarkSongMutation]);

	const value = useMemo(
		(): NowPlayingContextValue => ({
			tracks,
			trackIndex,
			currentTrack,
			handleSkip,
			handlePrevious,
			handleJumpToTrack,
			handleLike,
			handleDislike,
			handleSleep,
			handleBookmark,
			showTrackInfo,
			setShowTrackInfo,
			albumMeta,
			setAlbumMeta,
			isReady,
			startPlayback,
		}),
		[
			tracks,
			trackIndex,
			currentTrack,
			handleSkip,
			handlePrevious,
			handleJumpToTrack,
			handleLike,
			handleDislike,
			handleSleep,
			handleBookmark,
			showTrackInfo,
			albumMeta,
			isReady,
			startPlayback,
		],
	);

	return (
		<NowPlayingCtx.Provider value={value}>{children}</NowPlayingCtx.Provider>
	);
}
