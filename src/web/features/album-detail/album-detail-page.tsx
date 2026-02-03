import { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, Shuffle, Music, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { Skeleton } from "@/web/shared/ui/skeleton";
import { Button } from "@/web/shared/ui/button";
import {
	albumTrackToNowPlaying,
	shuffleArray,
	tracksToQueuePayload,
	formatTime,
} from "@/web/shared/lib/now-playing-utils";
import type { NowPlayingTrack } from "@/web/shared/lib/now-playing-utils";

function formatTotalDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) {
		return `${String(hours)} hr ${String(mins)} min`;
	}
	return `${String(mins)} min`;
}

export function AlbumDetailPage({
	albumId,
	autoPlay,
	startIndex,
	shuffle,
}: {
	readonly albumId: string;
	readonly autoPlay?: boolean;
	readonly startIndex?: number;
	readonly shuffle?: boolean;
}) {
	const navigate = useNavigate();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;

	const albumsQuery = trpc.library.albums.useQuery();
	const tracksQuery = trpc.library.albumTracks.useQuery({ albumId });

	const album = albumsQuery.data?.find((a) => a.id === albumId);
	const tracks = tracksQuery.data;

	const isLoading = albumsQuery.isLoading || tracksQuery.isLoading;

	// Track the current queue index via subscription
	const [queueIndex, setQueueIndex] = useState(0);
	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setQueueIndex(queueState.currentIndex);
		},
	});

	// Track whether this album is the active playback context
	const [isActiveContext, setIsActiveContext] = useState(false);
	const [nowPlayingTracks, setNowPlayingTracks] = useState<
		readonly NowPlayingTrack[]
	>([]);
	const hasAutoPlayedRef = useRef(false);

	// Determine if this album is currently playing
	const currentTrackId = playback.currentTrack?.trackToken;
	const activeTrackIds = nowPlayingTracks.map((t) => t.id);
	const isThisAlbumPlaying =
		isActiveContext && activeTrackIds.includes(currentTrackId ?? "");

	const startPlayback = useCallback(
		(idx: number, doShuffle: boolean) => {
			if (!tracks || !album) return;
			const ordered = tracks.map((t) =>
				albumTrackToNowPlaying(t, album.title, album.artworkUrl),
			);
			const newTracks = doShuffle ? shuffleArray(ordered) : ordered;
			const startIdx = doShuffle ? 0 : idx;
			setNowPlayingTracks(newTracks);
			setIsActiveContext(true);
			playbackRef.current.setCurrentStationToken(albumId);
			playbackRef.current.playMutation.mutate({
				tracks: tracksToQueuePayload(newTracks),
				context: { type: "album", albumId },
				startIndex: startIdx,
			});
		},
		[tracks, album, albumId],
	);

	// Auto-play on mount if search params request it
	useEffect(() => {
		if (!autoPlay || hasAutoPlayedRef.current || !tracks || !album) return;
		hasAutoPlayedRef.current = true;
		startPlayback(startIndex ?? 0, shuffle ?? false);
	}, [autoPlay, tracks, album, startIndex, shuffle, startPlayback]);

	const handlePlay = (idx = 0) => {
		startPlayback(idx, false);
	};

	const handleShuffle = () => {
		startPlayback(0, true);
	};

	useEffect(() => {
		if (playback.error) {
			toast.error(`Audio error: ${playback.error}`);
			playbackRef.current.clearError();
		}
	}, [playback.error]);

	if (isLoading) {
		return <AlbumDetailSkeleton />;
	}

	if (!album) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">Album not found</p>
			</div>
		);
	}

	const totalDuration =
		tracks?.reduce((sum, t) => sum + (t.duration ?? 0), 0) ?? 0;
	const trackCount = tracks?.length ?? 0;

	return (
		<div className="flex-1 p-6 max-w-2xl mx-auto space-y-6">
			<button
				type="button"
				onClick={() =>
					navigate({
						to: "/",
						search: {
							pl_sort: undefined,
							pl_page: undefined,
							al_sort: undefined,
							al_page: undefined,
						},
					})
				}
				className="flex items-center gap-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
			>
				<ArrowLeft className="w-4 h-4" />
				Back
			</button>

			<div className="flex gap-6 items-end">
				<div className="w-48 h-48 shrink-0 rounded-xl shadow-lg overflow-hidden bg-[var(--color-bg-highlight)]">
					{album.artworkUrl ? (
						<img
							src={album.artworkUrl}
							alt={album.title}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center">
							<Music className="w-16 h-16 text-[var(--color-text-dim)]" />
						</div>
					)}
				</div>
				<div className="space-y-1 min-w-0">
					<h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] leading-tight">
						{album.title}
					</h1>
					<p className="text-lg text-[var(--color-text-muted)]">
						{album.artist}
					</p>
					<p className="text-sm text-[var(--color-text-dim)]">
						{album.year ? `${String(album.year)} \u00B7 ` : ""}
						{String(trackCount)} track{trackCount !== 1 ? "s" : ""}
						{totalDuration > 0
							? ` \u00B7 ${formatTotalDuration(totalDuration)}`
							: ""}
					</p>
					<div className="flex gap-3 pt-3">
						<Button
							onClick={() => handlePlay(0)}
							className="gap-2 rounded-full bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
						>
							<Play className="w-4 h-4" fill="currentColor" />
							Play
						</Button>
						<Button
							variant="outline"
							onClick={handleShuffle}
							className="gap-2 rounded-full"
						>
							<Shuffle className="w-4 h-4" />
							Shuffle
						</Button>
					</div>
				</div>
			</div>

			{tracks && tracks.length > 0 && (
				<div className="space-y-0.5">
					{tracks.map((track, index) => {
						const isActive =
							isThisAlbumPlaying &&
							nowPlayingTracks[queueIndex]?.id === track.id;
						return (
							<button
								key={track.id}
								type="button"
								onClick={() => handlePlay(index)}
								className={`w-full flex items-center gap-4 px-3 py-2.5 rounded text-left transition-colors ${
									isActive
										? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
										: "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"
								}`}
							>
								<span className="w-6 text-right text-sm">
									{String(index + 1)}
								</span>
								<span className="flex-1 text-sm truncate">
									{track.title}
								</span>
								{track.duration != null && (
									<span className="text-xs">
										{formatTime(track.duration)}
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

function AlbumDetailSkeleton() {
	return (
		<div className="flex-1 p-6 max-w-2xl mx-auto space-y-6">
			<Skeleton className="h-5 w-16" />
			<div className="flex gap-6 items-end">
				<Skeleton className="w-48 h-48 rounded-xl shrink-0" />
				<div className="space-y-2 flex-1">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-48" />
					<div className="flex gap-3 pt-3">
						<Skeleton className="h-10 w-24 rounded-full" />
						<Skeleton className="h-10 w-28 rounded-full" />
					</div>
				</div>
			</div>
			<div className="space-y-1">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex items-center gap-4 px-3 py-2.5">
						<Skeleton className="w-6 h-4" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="w-10 h-4" />
					</div>
				))}
			</div>
		</div>
	);
}
