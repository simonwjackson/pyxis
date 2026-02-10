/**
 * @module SearchPage
 * Unified search page for discovering music across all sources.
 * Supports searching tracks, albums, artists, and genre stations.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import {
	sourceAlbumTrackToNowPlaying,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import type {
	SearchTrack,
	SearchAlbum,
	SearchArtist,
	SearchGenreStation,
} from "./search-results";
import { Spinner } from "@/web/shared/ui/spinner";

/**
 * Combined search results from all sources.
 */
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
			)
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
			)
		case "idle":
			return (
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<SearchIcon className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>
						Search for artists, songs, or albums across all sources
					</p>
				</div>
			)
	}
}

/**
 * Main search page with debounced search and results display.
 * Shows albums, tracks, artists, and genre stations from unified search.
 */
export function SearchPage() {
	const [query, setQuery] = useState("");
	const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);
	const utils = trpc.useUtils();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;

	const unifiedQuery = trpc.search.unified.useQuery(
		{ query },
		{ enabled: query.length >= 2 },
	)

	const createStation = trpc.radio.create.useMutation({
		onSuccess() {
			toast.success("Station created");
			utils.radio.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create station: ${err.message}`);
		},
	})

	const saveAlbum = trpc.library.saveAlbum.useMutation({
		onSuccess(data) {
			if (data.alreadyExists) {
				toast.info("Album already in your collection");
			} else {
				toast.success("Album saved to collection");
			}
			utils.library.albums.invalidate();
		},
		onError(err) {
			toast.error(`Failed to save album: ${err.message}`);
		},
	})

	const createRadio = trpc.playlist.createRadio.useMutation({
		onSuccess() {
			toast.success("Radio created");
			utils.playlist.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create radio: ${err.message}`);
		},
	})

	const handleSearch = useCallback((q: string) => {
		setQuery(q);
	}, []);

	const handleCreateStation = useCallback(
		(musicToken: string) => {
			createStation.mutate({ musicToken });
		},
		[createStation],
	)

	const handleSaveAlbum = useCallback(
		(albumId: string) => {
			saveAlbum.mutate({ id: albumId });
		},
		[saveAlbum],
	)

	const handlePlayAlbum = useCallback(
		async (albumId: string) => {
			if (playingAlbumId) return;
			setPlayingAlbumId(albumId);
			try {
				const data = await utils.album.getWithTracks.fetch({ id: albumId });
				const ordered = data.tracks.map((t) =>
					sourceAlbumTrackToNowPlaying(
						t,
						data.album.title,
						data.album.artworkUrl ?? null,
					),
				);
				playbackRef.current.setCurrentStationToken(albumId);
				playbackRef.current.playMutation.mutate({
					tracks: tracksToQueuePayload(ordered),
					context: { type: "album", albumId },
					startIndex: 0,
				});
			} catch {
				toast.error("Failed to load album");
			} finally {
				setPlayingAlbumId(null);
			}
		},
		[playingAlbumId, utils.album.getWithTracks],
	)

	const handleStartRadio = useCallback(
		(track: SearchTrack) => {
			createRadio.mutate({
				trackId: track.id,
				name: `${track.title} Radio`,
				...(track.artworkUrl != null
					? { artworkUrl: track.artworkUrl }
					: {}),
			})
		},
		[createRadio],
	)

	const searchState: SearchState = useMemo(() => {
		const data = unifiedQuery.data;

		if (unifiedQuery.isLoading && query.length >= 2) {
			return { type: "loading" };
		}

		if (data) {
			const hasResults =
				data.tracks.length > 0 ||
				data.albums.length > 0 ||
				data.pandoraArtists.length > 0 ||
				data.pandoraGenres.length > 0;

			if (hasResults) {
				return { type: "results", data };
			}

			return { type: "empty" };
		}

		return { type: "idle" };
	}, [unifiedQuery.isLoading, unifiedQuery.data, query.length]);

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Search</h2>
			<SearchInput
				onSearch={handleSearch}
				placeholder="Search artists, songs, albums..."
			/>
			<SearchContent
				state={searchState}
				onPlayAlbum={handlePlayAlbum}
				playingAlbumId={playingAlbumId}
				onSaveAlbum={handleSaveAlbum}
				onStartRadio={handleStartRadio}
				onCreateStation={handleCreateStation}
			/>
		</div>
	)
}
