/**
 * @module AlbumDetailPage
 * Album detail view for both library albums and source-backed albums.
 */

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { Play, Shuffle, Music, ArrowLeft, BookmarkPlus, Flame } from "lucide-react";
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
import {
	formatPlacementLabel,
	hotBadgeClassName,
	placementBadgeClassName,
	type AlbumPlacement,
} from "@/web/shared/lib/library-placement";

function formatTotalDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) return `${String(hours)} hr ${String(mins)} min`;
	return `${String(mins)} min`;
}

type AlbumDetailPageProps = {
	readonly albumId: string;
	readonly autoPlay?: boolean;
	readonly startIndex?: number;
	readonly shuffle?: boolean;
};

const PLACEMENTS: readonly AlbumPlacement[] = ["discovery", "collection", "archive", "dismissed"];

function PlacementBadge({ placement }: { readonly placement: AlbumPlacement }) {
	return (
		<span className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(placement)}`}>
			{formatPlacementLabel(placement)}
		</span>
	);
}

function HotBadge() {
	return (
		<span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}>
			<Flame className="w-3 h-3" />
			Hot
		</span>
	);
}

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
	const utils = trpc.useUtils();

	const isSourceBacked = albumId.includes(":");

	const libraryAlbumQuery = trpc.library.album.useQuery({ id: albumId }, { enabled: !isSourceBacked });
	const libraryTracksQuery = trpc.library.albumTracks.useQuery({ albumId }, { enabled: !isSourceBacked });
	const sourceQuery = trpc.album.getWithTracks.useQuery({ id: albumId }, { enabled: isSourceBacked });
	const sourceStateQuery = trpc.library.resolveAlbumStates.useQuery(
		{ sourceIds: isSourceBacked ? [albumId] : [] },
		{ enabled: isSourceBacked },
	);

	const sourceState = sourceStateQuery.data?.[0];
	const currentPlacement = isSourceBacked
		? sourceState?.placement
		: libraryAlbumQuery.data?.placement;
	const isHot = isSourceBacked ? (sourceState?.isHot ?? false) : (libraryAlbumQuery.data?.isHot ?? false);

	const album = isSourceBacked ? sourceQuery.data?.album : libraryAlbumQuery.data;
	const tracks = isSourceBacked ? sourceQuery.data?.tracks : libraryTracksQuery.data;

	const isLoading = isSourceBacked
		? sourceQuery.isLoading || sourceStateQuery.isLoading
		: libraryAlbumQuery.isLoading || libraryTracksQuery.isLoading;
	const isError = isSourceBacked ? sourceQuery.isError : libraryAlbumQuery.isError;

	const saveAlbum = trpc.library.saveAlbum.useMutation({
		onSuccess(data) {
			switch (data.outcome) {
				case "created":
					toast.success("album added to discovery");
					break;
				case "restored":
					toast.success("album restored to discovery");
					break;
				case "existing":
					toast.info(`album already in ${formatPlacementLabel(data.placement).toLowerCase()}`);
					break;
			}
			utils.library.albums.invalidate();
			utils.library.hotAlbums.invalidate();
			utils.library.resolveAlbumStates.invalidate();
			utils.library.album.invalidate();
		},
		onError(err) {
			toast.error(`Failed to add album: ${err.message}`);
		},
	});

	const setPlacement = trpc.library.setPlacement.useMutation({
		onSuccess(data) {
			toast.success(`moved to ${formatPlacementLabel(data.placement).toLowerCase()}`);
			utils.library.album.invalidate({ id: data.id });
			utils.library.albums.invalidate();
			utils.library.hotAlbums.invalidate();
			utils.library.resolveAlbumStates.invalidate();
		},
		onError(err) {
			toast.error(`Failed to move album: ${err.message}`);
		},
	});

	const updateAlbum = trpc.library.updateAlbum.useMutation({
		onSuccess: () => {
			utils.library.album.invalidate({ id: albumId });
			utils.library.albums.invalidate();
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
	}, [albumId, saveAlbum]);

	const handleSetPlacement = useCallback(
		(nextPlacement: AlbumPlacement) => {
			const targetAlbumId = isSourceBacked ? sourceState?.albumId : albumId;
			if (!targetAlbumId) return;
			setPlacement.mutate({ albumId: targetAlbumId, placement: nextPlacement });
		},
		[albumId, isSourceBacked, setPlacement, sourceState?.albumId],
	);

	const hasAutoPlayedRef = useRef(false);
	const currentTrackId = playback.currentTrack?.trackToken;

	const startPlayback = useCallback(
		(idx: number, doShuffle: boolean) => {
			if (!tracks || !album) return;
			const ordered = isSourceBacked
				? (tracks as readonly SourceAlbumTrack[]).map((track) =>
					sourceAlbumTrackToNowPlaying(track, album.title, album.artworkUrl ?? null),
				)
				: (tracks as readonly {
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
				}[]).map((track) => albumTrackToNowPlaying(track, album.title, album.artworkUrl ?? null));
			const newTracks = doShuffle ? shuffleArray(ordered) : ordered;
			const startAt = doShuffle ? 0 : idx;
			playbackRef.current.setCurrentStationToken(albumId);
			playbackRef.current.playMutation.mutate({
				tracks: tracksToQueuePayload(newTracks),
				context: { type: "album", albumId },
				startIndex: startAt,
			});
		},
		[album, albumId, isSourceBacked, tracks],
	);

	useEffect(() => {
		if (!autoPlay || hasAutoPlayedRef.current || !tracks || !album) return;
		hasAutoPlayedRef.current = true;
		startPlayback(startIndex ?? 0, shuffle ?? false);
	}, [album, autoPlay, shuffle, startIndex, startPlayback, tracks]);

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
				<p className="text-[var(--color-text-dim)]">couldn't load album</p>
				<Button variant="outline" onClick={() => (isSourceBacked ? sourceQuery.refetch() : libraryAlbumQuery.refetch())}>
					Retry
				</Button>
			</div>
		);
	}

	if (!album) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">album not found</p>
			</div>
		);
	}

	const totalDuration = tracks?.reduce((sum, track) => sum + (track.duration ?? 0), 0) ?? 0;
	const trackCount = tracks?.length ?? 0;
	const canManagePlacement = !isSourceBacked || Boolean(sourceState?.albumId);

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto space-y-8">
			<button
				type="button"
				onClick={() => router.history.back()}
				className="flex items-center gap-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
				aria-label="Go back"
			>
				<ArrowLeft className="w-4 h-4" aria-hidden="true" />
				Back
			</button>

			<div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-end">
				<div className="w-40 h-40 sm:w-56 sm:h-56 shrink-0 shadow-lg overflow-hidden bg-[var(--color-bg-highlight)]">
					{album.artworkUrl ? (
						<img src={album.artworkUrl} alt={album.title} className="w-full h-full object-cover" />
					) : (
						<div className="w-full h-full flex items-center justify-center">
							<Music className="w-16 h-16 text-[var(--color-text-dim)]" />
						</div>
					)}
				</div>
				<div className="space-y-1 min-w-0 text-center sm:text-left">
					<EditableText
						value={album.title}
						onSave={(title) => updateAlbum.mutate({ id: albumId, title })}
						disabled={isSourceBacked}
					>
						<h1 className="zune-heading text-3xl md:text-4xl text-[var(--color-text)]">{album.title}</h1>
					</EditableText>
					<EditableText
						value={album.artist}
						onSave={(artist) => updateAlbum.mutate({ id: albumId, artist })}
						disabled={isSourceBacked}
					>
						<p className="text-lg font-light tracking-tight text-[var(--color-text-muted)]">{album.artist}</p>
					</EditableText>
					<p className="zune-meta text-[var(--color-text-dim)]">
						{album.year ? `${String(album.year)} · ` : ""}
						{String(trackCount)} track{trackCount !== 1 ? "s" : ""}
						{totalDuration > 0 ? ` · ${formatTotalDuration(totalDuration)}` : ""}
					</p>
					<div className="flex gap-1.5 pt-2 flex-wrap justify-center sm:justify-start">
						{currentPlacement ? <PlacementBadge placement={currentPlacement} /> : null}
						{isHot ? <HotBadge /> : null}
					</div>
					<div className="flex gap-2 sm:gap-3 pt-4 flex-wrap justify-center sm:justify-start">
						<Button
							onClick={() => startPlayback(0, false)}
							className="gap-2 bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
						>
							<Play className="w-4 h-4" fill="currentColor" />
							Play
						</Button>
						<Button variant="outline" onClick={() => startPlayback(0, true)} className="gap-2">
							<Shuffle className="w-4 h-4" />
							Shuffle
						</Button>
						{!currentPlacement ? (
							<Button variant="outline" onClick={handleSave} disabled={saveAlbum.isPending} className="gap-2">
								<BookmarkPlus className="w-4 h-4" />
								{saveAlbum.isPending ? "Adding..." : "Add to Discovery"}
							</Button>
						) : currentPlacement === "dismissed" ? (
							<Button variant="outline" onClick={handleSave} disabled={saveAlbum.isPending} className="gap-2">
								<BookmarkPlus className="w-4 h-4" />
								{saveAlbum.isPending ? "Restoring..." : "Move to Discovery"}
							</Button>
						) : null}
					</div>
					{canManagePlacement ? (
						<div className="pt-2 space-y-2">
							<p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-dim)]">placement</p>
							<div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center sm:justify-start">
								{PLACEMENTS.map((placement) => {
									const active = currentPlacement === placement;
									return (
										<button
											key={placement}
											type="button"
											onClick={() => handleSetPlacement(placement)}
											disabled={active || setPlacement.isPending}
											className={active
												? `px-3 py-1.5 text-xs uppercase tracking-[0.18em] ${placementBadgeClassName(placement)}`
												: "px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"}
										>
											{formatPlacementLabel(placement)}
										</button>
									);
								})}
							</div>
						</div>
					) : null}
					{currentPlacement === "dismissed" && isHot ? (
						<p className="text-sm text-[var(--color-text-dim)]">
							This album is dismissed but still hot from recent listening.
						</p>
					) : null}
				</div>
			</div>

			{tracks && tracks.length > 0 ? (
				<div className="space-y-px">
					{tracks.map((track, index) => {
						const isActive = currentTrackId === track.id;
						return (
							<button
								key={track.id}
								type="button"
								onClick={() => startPlayback(index, false)}
								className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${
									isActive
										? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
										: "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"
								}`}
							>
								<span className="w-6 text-right text-sm">{String(index + 1)}</span>
								<EditableText
									value={track.title}
									onSave={(title) => updateTrack.mutate({ id: track.id, title })}
									disabled={isSourceBacked}
									className="flex-1 min-w-0"
								>
									<span className="text-sm truncate block">{track.title}</span>
								</EditableText>
								{track.duration != null ? <span className="text-xs">{formatTime(track.duration)}</span> : null}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

function AlbumDetailSkeleton() {
	return (
		<div className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto space-y-8">
			<Skeleton className="h-5 w-16" />
			<div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-end">
				<Skeleton className="w-40 h-40 sm:w-56 sm:h-56 shrink-0" />
				<div className="space-y-2 flex-1 items-center sm:items-start flex flex-col">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-48" />
					<div className="flex gap-3 pt-4 justify-center sm:justify-start">
						<Skeleton className="h-10 w-24" />
						<Skeleton className="h-10 w-28" />
					</div>
				</div>
			</div>
			<div className="space-y-1">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="flex items-center gap-4 px-3 py-2.5">
						<Skeleton className="w-6 h-4" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="w-10 h-4" />
					</div>
				))}
			</div>
		</div>
	);
}
