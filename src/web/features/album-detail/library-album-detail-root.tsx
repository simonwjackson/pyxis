/**
 * @module LibraryAlbumDetailRoot
 *
 * Library-backed album detail root. Reads `library.album.get` and
 * `library.albumTracks.list` through the Effect RPC client and adapts the
 * two AsyncResults into the pure {@link LibraryAlbumDetailState} ADT before
 * rendering. The album query subscribes to {@link libraryAlbumTag} so
 * save/place/update mutations on this surface (or anywhere else) refresh
 * the detail in step with the legacy `utils.library.album.invalidate({ id })`.
 *
 * Mutations preserve the legacy invalidation fan-outs through reactivity
 * tags:
 *
 *  - `library.album.save` and `library.albumPlacement.set` publish
 *    {@link LIBRARY_ALBUMS_TAG}, {@link LIBRARY_HOT_ALBUMS_TAG},
 *    {@link LIBRARY_ALBUM_STATES_TAG}, and {@link libraryAlbumTag} (mirroring
 *    the legacy `utils.library.albums` + `utils.library.hotAlbums` +
 *    `utils.library.resolveAlbumStates` + `utils.library.album` invalidation
 *    quadruple).
 *  - `library.album.update` publishes {@link libraryAlbumTag} and
 *    {@link LIBRARY_ALBUMS_TAG} (mirroring the legacy
 *    `utils.library.album.invalidate({ id }) + utils.library.albums.invalidate()`).
 *  - `library.track.update` publishes {@link libraryAlbumTracksTag}
 *    (mirroring the legacy
 *    `utils.library.albumTracks.invalidate({ albumId })`).
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	LIBRARY_ALBUM_STATES_TAG,
	LIBRARY_ALBUMS_TAG,
	LIBRARY_HOT_ALBUMS_TAG,
	libraryAlbumTag,
	libraryAlbumTracksTag,
} from "@/web/features/home/libraryReactivityTags";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import {
	type AlbumPlacement,
	formatPlacementLabel,
} from "@/web/shared/lib/library-placement";
import {
	albumTrackToNowPlaying,
	shuffleArray,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { LibraryAlbumDetailState } from "./AlbumDetailState";
import { AlbumDetailContent } from "./album-detail-content";
import { AlbumDetailSkeleton } from "./album-detail-skeleton";
import type { AlbumDetailPageProps } from "./types";

const saveAlbumMutationAtom = PyxisRpcClient.mutation("library.album.save");
const setPlacementMutationAtom = PyxisRpcClient.mutation(
	"library.albumPlacement.set",
);
const updateAlbumMutationAtom = PyxisRpcClient.mutation("library.album.update");
const updateTrackMutationAtom = PyxisRpcClient.mutation("library.track.update");

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

	const albumQueryAtom = useMemo(
		() =>
			PyxisRpcClient.query(
				"library.album.get",
				{ id: albumId },
				{ reactivityKeys: [libraryAlbumTag(albumId)] as const },
			),
		[albumId],
	);
	const tracksQueryAtom = useMemo(
		() =>
			PyxisRpcClient.query(
				"library.albumTracks.list",
				{ albumId },
				{ reactivityKeys: [libraryAlbumTracksTag(albumId)] as const },
			),
		[albumId],
	);

	const albumResult = projectQueryResult(useAtomValue(albumQueryAtom));
	const tracksResult = projectQueryResult(useAtomValue(tracksQueryAtom));
	const state = LibraryAlbumDetailState.fromResults(albumResult, tracksResult);

	const albumWriteKeys = useMemo(
		() =>
			[
				LIBRARY_ALBUMS_TAG,
				LIBRARY_HOT_ALBUMS_TAG,
				LIBRARY_ALBUM_STATES_TAG,
				libraryAlbumTag(albumId),
			] as const,
		[albumId],
	);
	const albumMetadataKeys = useMemo(
		() => [LIBRARY_ALBUMS_TAG, libraryAlbumTag(albumId)] as const,
		[albumId],
	);
	const tracksWriteKeys = useMemo(
		() => [libraryAlbumTracksTag(albumId)] as const,
		[albumId],
	);

	const saveAlbumResult = useAtomValue(saveAlbumMutationAtom);
	const setPlacementResult = useAtomValue(setPlacementMutationAtom);
	const isSavingAlbum = AsyncResult.isWaiting(saveAlbumResult);
	const isSettingPlacement = AsyncResult.isWaiting(setPlacementResult);

	const saveAlbum = useAtomSet(saveAlbumMutationAtom, {
		mode: "promiseExit",
	});
	const setPlacement = useAtomSet(setPlacementMutationAtom, {
		mode: "promiseExit",
	});
	const updateAlbum = useAtomSet(updateAlbumMutationAtom, {
		mode: "promiseExit",
	});
	const updateTrack = useAtomSet(updateTrackMutationAtom, {
		mode: "promiseExit",
	});

	const album = state._tag === "Ready" ? state.album : null;
	const tracks = state._tag === "Ready" ? state.tracks : null;
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

	const handleSaveAlbum = useCallback(() => {
		void saveAlbum({
			payload: { id: albumId },
			reactivityKeys: albumWriteKeys,
		}).then((exit) => {
			if (exit._tag !== "Success") {
				toast.error("Failed to add album");
				return;
			}
			switch (exit.value.outcome) {
				case "created":
					toast.success("album added to discovery");
					break;
				case "restored":
					toast.success("album restored to discovery");
					break;
				case "existing":
					toast.info(
						`album already in ${formatPlacementLabel(
							exit.value.placement,
						).toLowerCase()}`,
					);
					break;
			}
		});
	}, [albumId, albumWriteKeys, saveAlbum]);

	const handleSetPlacement = useCallback(
		(placement: AlbumPlacement) => {
			void setPlacement({
				payload: { albumId, placement },
				reactivityKeys: albumWriteKeys,
			}).then((exit) => {
				if (exit._tag !== "Success") {
					toast.error("Failed to move album");
					return;
				}
				toast.success(
					`moved to ${formatPlacementLabel(exit.value.placement).toLowerCase()}`,
				);
			});
		},
		[albumId, albumWriteKeys, setPlacement],
	);

	const handleUpdateAlbum = useCallback(
		(patch: { readonly title?: string; readonly artist?: string }) => {
			void updateAlbum({
				payload: { id: albumId, ...patch },
				reactivityKeys: albumMetadataKeys,
			}).then((exit) => {
				if (exit._tag !== "Success") {
					toast.error("Failed to rename");
				}
			});
		},
		[albumId, albumMetadataKeys, updateAlbum],
	);

	const handleUpdateTrack = useCallback(
		(trackId: string, title: string) => {
			void updateTrack({
				payload: { id: trackId, title },
				reactivityKeys: tracksWriteKeys,
			}).then((exit) => {
				if (exit._tag !== "Success") {
					toast.error("Failed to rename");
				}
			});
		},
		[tracksWriteKeys, updateTrack],
	);

	if (state._tag === "Loading") {
		return <AlbumDetailSkeleton />;
	}

	if (state._tag === "LoadError" || state._tag === "Defect") {
		return (
			<div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
				<p className="text-[var(--color-text-dim)]">couldn't load album</p>
			</div>
		);
	}

	if (state._tag === "NotFound" || !album || !tracks) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">album not found</p>
			</div>
		);
	}

	return (
		<AlbumDetailContent
			album={album}
			tracks={tracks}
			currentTrackId={currentTrackId ?? undefined}
			currentPlacement={album.placement}
			isHot={album.isHot}
			canManagePlacement={true}
			canEditMetadata={true}
			isSavingAlbum={isSavingAlbum}
			isSettingPlacement={isSettingPlacement}
			onBack={() => router.history.back()}
			onPlay={() => startPlayback(0, false)}
			onPlayTrack={(index) => startPlayback(index, false)}
			onSaveAlbum={handleSaveAlbum}
			onSetPlacement={handleSetPlacement}
			onUpdateAlbum={handleUpdateAlbum}
			onUpdateTrack={handleUpdateTrack}
		/>
	);
}
