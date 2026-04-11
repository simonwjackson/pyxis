/**
 * @module SearchPage
 * Unified search page for discovering music across all sources.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import {
	sourceAlbumTrackToNowPlaying,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import { formatPlacementLabel } from "@/web/shared/lib/library-placement";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import type {
	SearchTrack,
	SearchAlbum,
	SearchArtist,
	SearchGenreStation,
} from "./search-results";
import { Spinner } from "@/web/shared/ui/spinner";

type SearchData = {
	readonly tracks: readonly SearchTrack[];
	readonly albums: readonly SearchAlbum[];
	readonly pandoraArtists: readonly SearchArtist[];
	readonly pandoraGenres: readonly SearchGenreStation[];
};

type SearchState =
	| { readonly type: "idle" }
	| { readonly type: "loading" }
	| { readonly type: "empty" }
	| { readonly type: "results"; readonly data: SearchData };

function SearchContent({
	state,
	onPlayAlbum,
	playingAlbumId,
	onSaveAlbum,
	onStartRadio,
	onCreateStation,
}: {
	readonly state: SearchState;
	readonly onPlayAlbum: (albumId: string) => void;
	readonly playingAlbumId: string | null;
	readonly onSaveAlbum: (albumId: string) => void;
	readonly onStartRadio: (track: SearchTrack) => void;
	readonly onCreateStation: (musicToken: string) => void;
}) {
	switch (state.type) {
		case "loading":
			return (
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			);
		case "empty":
			return <SearchResults.Empty />;
		case "results":
			return (
				<SearchResults.Root>
					{state.data.albums.length > 0 && (
						<SearchResults.Albums
							albums={state.data.albums}
							onPlayAlbum={onPlayAlbum}
							playingAlbumId={playingAlbumId}
							onSaveAlbum={onSaveAlbum}
						/>
					)}
					{state.data.tracks.length > 0 && (
						<SearchResults.Tracks
							tracks={state.data.tracks}
							onStartRadio={onStartRadio}
						/>
					)}
					{state.data.pandoraArtists.length > 0 && (
						<SearchResults.Artists
							artists={state.data.pandoraArtists}
							onCreateStation={onCreateStation}
						/>
					)}
					{state.data.pandoraGenres.length > 0 && (
						<SearchResults.Genres
							genres={state.data.pandoraGenres}
							onCreateStation={onCreateStation}
						/>
					)}
				</SearchResults.Root>
			);
		case "idle":
			return (
				<div className="text-center py-20 text-[var(--color-text-dim)]">
					<p className="zune-display text-5xl sm:text-6xl text-[var(--color-text-dim)]/40 mb-6">
						discover
					</p>
					<p className="text-sm">search for artists, songs, or albums across all sources</p>
				</div>
			);
	}
}

export function SearchPage() {
	const [query, setQuery] = useState("");
	const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);
	const utils = trpc.useUtils();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;

	const unifiedQuery = trpc.search.unified.useQuery({ query }, { enabled: query.length >= 2 });

	const sourceIds = useMemo(
		() => unifiedQuery.data?.albums.flatMap((album) => album.sourceIds) ?? [],
		[unifiedQuery.data],
	);
	const libraryStatesQuery = trpc.library.resolveAlbumStates.useQuery(
		{ sourceIds },
		{ enabled: sourceIds.length > 0 },
	);

	const createStation = trpc.radio.create.useMutation({
		onSuccess() {
			toast.success("station created");
			utils.radio.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create station: ${err.message}`);
		},
	});

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
		},
		onError(err) {
			toast.error(`Failed to add album: ${err.message}`);
		},
	});

	const createRadio = trpc.playlist.createRadio.useMutation({
		onSuccess() {
			toast.success("radio created");
			utils.playlist.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create radio: ${err.message}`);
		},
	});

	const handleSearch = useCallback((nextQuery: string) => {
		setQuery(nextQuery);
	}, []);

	const handleCreateStation = useCallback(
		(musicToken: string) => {
			createStation.mutate({ musicToken });
		},
		[createStation],
	);

	const handleSaveAlbum = useCallback(
		(albumId: string) => {
			saveAlbum.mutate({ id: albumId });
		},
		[saveAlbum],
	);

	const handlePlayAlbum = useCallback(
		async (albumId: string) => {
			if (playingAlbumId) return;
			setPlayingAlbumId(albumId);
			try {
				const data = await utils.album.getWithTracks.fetch({ id: albumId });
				const ordered = data.tracks.map((track) =>
					sourceAlbumTrackToNowPlaying(track, data.album.title, data.album.artworkUrl ?? null),
				);
				playbackRef.current.setCurrentStationToken(albumId);
				playbackRef.current.playMutation.mutate({
					tracks: tracksToQueuePayload(ordered),
					context: { type: "album", albumId },
					startIndex: 0,
				});
			} catch {
				toast.error("failed to load album");
			} finally {
				setPlayingAlbumId(null);
			}
		},
		[playingAlbumId, utils.album.getWithTracks],
	);

	const handleStartRadio = useCallback(
		(track: SearchTrack) => {
			createRadio.mutate({
				trackId: track.id,
				name: `${track.title} Radio`,
				...(track.artworkUrl != null ? { artworkUrl: track.artworkUrl } : {}),
			});
		},
		[createRadio],
	);

	const searchState: SearchState = useMemo(() => {
		const data = unifiedQuery.data;
		const resolvedStates = new Map(
			(libraryStatesQuery.data ?? []).map((state) => [state.sourceId, state] as const),
		);

		if (unifiedQuery.isLoading && query.length >= 2) {
			return { type: "loading" };
		}

		if (data) {
			const albums = data.albums.map((album) => {
				const matchedState = album.sourceIds
					.map((sourceId) => resolvedStates.get(sourceId))
					.find(Boolean);
				return {
					...album,
					...(matchedState
						? {
							state: {
								albumId: matchedState.albumId,
								placement: matchedState.placement,
								isHot: matchedState.isHot,
							},
						}
						: {}),
				};
			});

			const hasResults =
				data.tracks.length > 0 ||
				albums.length > 0 ||
				data.pandoraArtists.length > 0 ||
				data.pandoraGenres.length > 0;

			if (hasResults) {
				return {
					type: "results",
					data: {
						tracks: data.tracks,
						albums,
						pandoraArtists: data.pandoraArtists,
						pandoraGenres: data.pandoraGenres,
					},
				};
			}

			return { type: "empty" };
		}

		return { type: "idle" };
	}, [libraryStatesQuery.data, query.length, unifiedQuery.data, unifiedQuery.isLoading]);

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 space-y-6">
			<h2 className="zune-display zune-page-title text-[var(--color-text)] mb-4">search</h2>
			<SearchInput onSearch={handleSearch} placeholder="search artists, songs, albums..." />
			<SearchContent
				state={searchState}
				onPlayAlbum={handlePlayAlbum}
				playingAlbumId={playingAlbumId}
				onSaveAlbum={handleSaveAlbum}
				onStartRadio={handleStartRadio}
				onCreateStation={handleCreateStation}
			/>
		</div>
	);
}
