/**
 * @module AlbumDetailPage
 * Album detail view showing track listing with play and shuffle controls.
 * Supports both library albums (nanoid) and source-backed albums (source:id).
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Play, Shuffle, Music, ArrowLeft, BookmarkPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { Skeleton } from "@/web/shared/ui/skeleton";
import { Button } from "@/web/shared/ui/button";
import { EditableText } from "@/web/shared/ui/editable-text";
import {
	albumTrackToNowPlaying,
	sourceAlbumTrackToNowPlaying,
	shuffleArray,
	tracksToQueuePayload,
	formatTime,
} from "@/web/shared/lib/now-playing-utils";
import type { SourceAlbumTrack } from "@/web/shared/lib/now-playing-utils";

/**
 * Formats total duration as human-readable string.
 * @param totalSeconds - Duration in seconds
 * @returns Formatted string (e.g., "1 hr 23 min" or "45 min")
 */
function formatTotalDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) {
		return `${String(hours)} hr ${String(mins)} min`;
	}
	return `${String(mins)} min`;
}

/**
 * Props for the AlbumDetailPage component.
 */
type AlbumDetailPageProps = {
	/** Album ID to display (nanoid for library, source:id for browsing) */
	readonly albumId: string;
	/** Whether to auto-play on mount */
	readonly autoPlay?: boolean;
	/** Track index to start playback from */
	readonly startIndex?: number;
	/** Whether to shuffle tracks on play */
	readonly shuffle?: boolean;
};

/**
 * Album detail page showing album art, metadata, and track listing.
 * Supports both library albums and source-backed albums.
 *
 * @param props - Album detail page props
 */
export function AlbumDetailPage({
	albumId,
	autoPlay,
	startIndex,
	shuffle,
}: AlbumDetailPageProps) {
	const router = useRouter();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;

	const isSourceBacked = albumId.includes(":");

	// Library data (disabled when source-backed)
	const libraryAlbumsQuery = trpc.library.albums.useQuery(undefined, {
		enabled: !isSourceBacked,
	});
	const libraryTracksQuery = trpc.library.albumTracks.useQuery(
		{ albumId },
		{ enabled: !isSourceBacked },
	);

	// Source data (disabled when library)
	const sourceQuery = trpc.album.getWithTracks.useQuery(
		{ id: albumId },
		{ enabled: isSourceBacked },
	);

	// Normalize album data
	const album = isSourceBacked
		? sourceQuery.data?.album
		: libraryAlbumsQuery.data?.find((a) => a.id === albumId);

	// Normalize tracks to a common shape for rendering
	const libraryTracks = libraryTracksQuery.data;
	const sourceTracks = sourceQuery.data?.tracks;

	const tracks = isSourceBacked ? sourceTracks : libraryTracks;

	const isLoading = isSourceBacked
		? sourceQuery.isLoading
		: libraryAlbumsQuery.isLoading || libraryTracksQuery.isLoading;

	const isError = isSourceBacked ? sourceQuery.isError : false;

	// Save to library mutation
	const utils = trpc.useUtils();
	const [isSaved, setIsSaved] = useState(false);
	const saveAlbum = trpc.library.saveAlbum.useMutation({
		onSuccess(data) {
			if (data.alreadyExists) {
				toast.info("Album already in your collection");
			} else {
				toast.success("Album saved to collection");
			}
			setIsSaved(true);
			utils.library.albums.invalidate();
		},
		onError(err) {
			toast.error(`Failed to save album: ${err.message}`);
		},
	});

	const updateAlbum = trpc.library.updateAlbum.useMutation({
		onSuccess: () => {
			utils.library.albums.invalidate();
			utils.library.albumTracks.invalidate({ albumId });
		},
		onError: (err) => toast.error(`Failed to rename: ${err.message}`),
	});

	const updateTrack = trpc.library.updateTrack.useMutation({
		onSuccess: () => {
			utils.library.albumTracks.invalidate({ albumId });
		},
		onError: (err) => toast.error(`Failed to rename: ${err.message}`),
	});

	const handleSave = useCallback(() => {
		saveAlbum.mutate({ id: albumId });
	}, [saveAlbum, albumId]);

	const hasAutoPlayedRef = useRef(false);

	const currentTrackId = playback.currentTrack?.trackToken;

	const startPlayback = useCallback(
		(idx: number, doShuffle: boolean) => {
			if (!tracks || !album) return;
			const ordered = isSourceBacked
				? (tracks as readonly SourceAlbumTrack[]).map((t) =>
						sourceAlbumTrackToNowPlaying(
							t,
							album.title,
							album.artworkUrl ?? null,
						),
					)
				: (
						tracks as readonly {
							readonly id: string;
							readonly trackIndex: number;
							readonly title: string;
							readonly artist: string;
							readonly duration: number | null;
							readonly artworkUrl: string | null;
							readonly capabilities: {
								readonly feedback: boolean;
								readonly sleep: boolean;
								readonly bookmark: boolean;
								readonly explain: boolean;
								readonly radio: boolean;
							};
						}[]
					).map((t) =>
						albumTrackToNowPlaying(t, album.title, album.artworkUrl ?? null),
					);
			const newTracks = doShuffle ? shuffleArray(ordered) : ordered;
			const startIdx = doShuffle ? 0 : idx;
			playbackRef.current.setCurrentStationToken(albumId);
			playbackRef.current.playMutation.mutate({
				tracks: tracksToQueuePayload(newTracks),
				context: { type: "album", albumId },
				startIndex: startIdx,
			});
		},
		[tracks, album, albumId, isSourceBacked],
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

	if (isError) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
				<p className="text-[var(--color-text-dim)]">
					Couldn't load album
				</p>
				<Button
					variant="outline"
					onClick={() => sourceQuery.refetch()}
					className="rounded-full"
				>
					Retry
				</Button>
			</div>
		);
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
				onClick={() => router.history.back()}
				className="flex items-center gap-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
				aria-label="Go back"
			>
				<ArrowLeft className="w-4 h-4" aria-hidden="true" />
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
					<EditableText
						value={album.title}
						onSave={(title) => updateAlbum.mutate({ id: albumId, title })}
						disabled={isSourceBacked}
					>
						<h1 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] leading-tight">
							{album.title}
						</h1>
					</EditableText>
					<EditableText
						value={album.artist}
						onSave={(artist) => updateAlbum.mutate({ id: albumId, artist })}
						disabled={isSourceBacked}
					>
						<p className="text-lg text-[var(--color-text-muted)]">
							{album.artist}
						</p>
					</EditableText>
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
						{isSourceBacked && (
							<Button
								variant="outline"
								onClick={handleSave}
								disabled={isSaved || saveAlbum.isPending}
								className="gap-2 rounded-full"
							>
								{isSaved ? (
									<>
										<Check className="w-4 h-4" />
										Saved
									</>
								) : (
									<>
										<BookmarkPlus className="w-4 h-4" />
										{saveAlbum.isPending ? "Saving..." : "Save"}
									</>
								)}
							</Button>
						)}
					</div>
				</div>
			</div>

			{tracks && tracks.length > 0 && (
				<div className="space-y-0.5">
					{tracks.map((track, index) => {
						const isActive = currentTrackId === track.id;
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
								<EditableText
									value={track.title}
									onSave={(title) => updateTrack.mutate({ id: track.id, title })}
									disabled={isSourceBacked}
									className="flex-1 min-w-0"
								>
									<span className="text-sm truncate block">
										{track.title}
									</span>
								</EditableText>
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

/**
 * Loading skeleton for the album detail page.
 */
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
