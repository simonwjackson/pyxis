import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import {
	albumTrackToNowPlaying,
	shuffleArray,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { formatPlacementLabel, type AlbumPlacement } from "@/web/shared/lib/library-placement";
import { Button } from "@/web/shared/ui/button";
import { AlbumDetailContent } from "./album-detail-content";
import { AlbumDetailSkeleton } from "./album-detail-skeleton";
import type { AlbumDetailPageProps } from "./types";

export function LibraryAlbumDetailRoot({
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

	const albumQuery = trpc.library.album.useQuery({ id: albumId });
	const tracksQuery = trpc.library.albumTracks.useQuery({ albumId });

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

	const updateAlbum = trpc.library.updateAlbum.useMutation({
		onSuccess: () => {
			utils.library.album.invalidate({ id: albumId });
			utils.library.albums.invalidate();
		},
		onError: (error) => toast.error(`Failed to rename: ${error.message}`),
	});

	const updateTrack = trpc.library.updateTrack.useMutation({
		onSuccess: () => {
			utils.library.albumTracks.invalidate({ albumId });
		},
		onError: (error) => toast.error(`Failed to rename: ${error.message}`),
	});

	const album = albumQuery.data;
	const tracks = tracksQuery.data;
	const currentTrackId = playback.currentTrack?.trackToken;
	const hasAutoPlayedRef = useRef(false);

	const startPlayback = useCallback(
		(index: number, doShuffle: boolean) => {
			if (!tracks || !album) return;
			const ordered = tracks.map((track) =>
				albumTrackToNowPlaying(track, album.title, album.artworkUrl ?? null),
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

	if (albumQuery.isLoading || tracksQuery.isLoading) {
		return <AlbumDetailSkeleton />;
	}

	if (albumQuery.isError) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
				<p className="text-[var(--color-text-dim)]">couldn't load album</p>
				<Button variant="outline" onClick={() => albumQuery.refetch()}>
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
			currentPlacement={album.placement}
			isHot={album.isHot}
			canManagePlacement={true}
			canEditMetadata={true}
			isSavingAlbum={saveAlbum.isPending}
			isSettingPlacement={setPlacement.isPending}
			onBack={() => router.history.back()}
			onPlay={() => startPlayback(0, false)}
			onPlayTrack={(index) => startPlayback(index, false)}
			onSaveAlbum={() => saveAlbum.mutate({ id: albumId })}
			onSetPlacement={(placement: AlbumPlacement) =>
				setPlacement.mutate({ albumId, placement })}
			onUpdateAlbum={(patch) => updateAlbum.mutate({ id: albumId, ...patch })}
			onUpdateTrack={(trackId, title) => updateTrack.mutate({ id: trackId, title })}
		/>
	);
}
