import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import {
	sourceAlbumTrackToNowPlaying,
	shuffleArray,
	tracksToQueuePayload,
	type SourceAlbumTrack,
} from "@/web/shared/lib/now-playing-utils";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { formatPlacementLabel, type AlbumPlacement } from "@/web/shared/lib/library-placement";
import { Button } from "@/web/shared/ui/button";
import { AlbumDetailContent } from "./album-detail-content";
import { AlbumDetailSkeleton } from "./album-detail-skeleton";
import type { AlbumDetailPageProps } from "./types";

export function SourceAlbumDetailRoot({
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

	const sourceQuery = trpc.album.getWithTracks.useQuery({ id: albumId });
	const sourceStateQuery = trpc.library.resolveAlbumStates.useQuery({ sourceIds: [albumId] });

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
					toast.info(
						`album already in ${formatPlacementLabel(data.placement).toLowerCase()}`,
					);
					break;
			}
			utils.library.albums.invalidate();
			utils.library.hotAlbums.invalidate();
			utils.library.resolveAlbumStates.invalidate();
			utils.library.album.invalidate();
		},
		onError(error) {
			toast.error(`Failed to add album: ${error.message}`);
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
		onError(error) {
			toast.error(`Failed to move album: ${error.message}`);
		},
	});

	const sourceState = sourceStateQuery.data?.[0];
	const album = sourceQuery.data?.album;
	const tracks = sourceQuery.data?.tracks;
	const currentTrackId = playback.currentTrack?.trackToken;
	const hasAutoPlayedRef = useRef(false);

	const startPlayback = useCallback(
		(index: number, doShuffle: boolean) => {
			if (!tracks || !album) return;
			const ordered = (tracks as readonly SourceAlbumTrack[]).map((track) =>
				sourceAlbumTrackToNowPlaying(track, album.title, album.artworkUrl ?? null),
			);
			const nextTracks = doShuffle ? shuffleArray(ordered) : ordered;
			playbackRef.current.playQueue({
				tracks: tracksToQueuePayload(nextTracks),
				context: { type: "album", albumId },
				startIndex: doShuffle ? 0 : index,
			});
		},
		[album, albumId, tracks],
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

	if (sourceQuery.isLoading || sourceStateQuery.isLoading) {
		return <AlbumDetailSkeleton />;
	}

	if (sourceQuery.isError) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
				<p className="text-[var(--color-text-dim)]">couldn't load album</p>
				<Button variant="outline" onClick={() => sourceQuery.refetch()}>
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

	return (
		<AlbumDetailContent
			album={album}
			tracks={tracks ?? []}
			currentTrackId={currentTrackId ?? undefined}
			currentPlacement={sourceState?.placement}
			isHot={sourceState?.isHot ?? false}
			canManagePlacement={Boolean(sourceState?.albumId)}
			canEditMetadata={false}
			isSavingAlbum={saveAlbum.isPending}
			isSettingPlacement={setPlacement.isPending}
			onBack={() => router.history.back()}
			onPlay={() => startPlayback(0, false)}
			onShuffle={() => startPlayback(0, true)}
			onPlayTrack={(index) => startPlayback(index, false)}
			onSaveAlbum={() => saveAlbum.mutate({ id: albumId })}
			onSetPlacement={
				sourceState?.albumId
					? (placement: AlbumPlacement) =>
						setPlacement.mutate({ albumId: sourceState.albumId, placement })
					: undefined
			}
		/>
	);
}
