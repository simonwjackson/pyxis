import { useState, useCallback } from "react";
import { Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { SearchInput } from "../components/search/SearchInput";
import { SearchResults } from "../components/search/SearchResults";
import { Spinner } from "../components/ui/spinner";
import type { CanonicalAlbum, CanonicalTrack } from "../../sources/types";

export function SearchPage() {
	const [query, setQuery] = useState("");
	const utils = trpc.useUtils();

	const unifiedQuery = trpc.search.unified.useQuery(
		{ query },
		{ enabled: query.length >= 2 },
	);

	const createStation = trpc.stations.create.useMutation({
		onSuccess() {
			toast.success("Station created");
			utils.stations.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create station: ${err.message}`);
		},
	});

	const addAlbumWithTracks =
		trpc.collection.addAlbumWithTracks.useMutation({
			onSuccess(data) {
				if (data.alreadyExists) {
					toast.info("Album already in your collection");
				} else {
					toast.success("Album saved to collection");
				}
				utils.collection.listAlbums.invalidate();
			},
			onError(err) {
				toast.error(`Failed to save album: ${err.message}`);
			},
		});

	const createRadio = trpc.playlists.createRadio.useMutation({
		onSuccess() {
			toast.success("Radio created");
			utils.playlists.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create radio: ${err.message}`);
		},
	});

	const handleSearch = useCallback((q: string) => {
		setQuery(q);
	}, []);

	const handleCreateStation = useCallback(
		(musicToken: string) => {
			createStation.mutate({ musicToken });
		},
		[createStation],
	);

	const handleSaveAlbum = useCallback(
		(album: CanonicalAlbum) => {
			addAlbumWithTracks.mutate({
				id: album.id,
				title: album.title,
				artist: album.artist,
				...(album.year != null ? { year: album.year } : {}),
				...(album.artworkUrl != null
					? { artworkUrl: album.artworkUrl }
					: {}),
				sourceRefs: album.sourceIds.map((sid) => ({
					source: sid.source,
					sourceId: sid.id,
				})),
				tracks: album.tracks.map((track, index) => ({
					trackIndex: index,
					title: track.title,
					artist: track.artist,
					...(track.duration != null
						? { duration: Math.round(track.duration) }
						: {}),
					source: track.sourceId.source,
					sourceTrackId: track.sourceId.id,
					...(track.artworkUrl != null
						? { artworkUrl: track.artworkUrl }
						: {}),
				})),
			});
		},
		[addAlbumWithTracks],
	);

	const handleStartRadio = useCallback(
		(track: CanonicalTrack) => {
			createRadio.mutate({
				seedTrackId: track.id,
				name: `${track.title} Radio`,
				...(track.artworkUrl != null
					? { artworkUrl: track.artworkUrl }
					: {}),
			});
		},
		[createRadio],
	);

	const isLoading = unifiedQuery.isLoading;
	const data = unifiedQuery.data;

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Search</h2>
			<SearchInput
				onSearch={handleSearch}
				placeholder="Search artists, songs, albums..."
			/>
			{isLoading && query.length >= 2 && (
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			)}
			{data && (
				<SearchResults
					tracks={data.tracks}
					albums={data.albums}
					artists={data.pandoraArtists}
					genreStations={data.pandoraGenres}
					onCreateStation={handleCreateStation}
					onSaveAlbum={handleSaveAlbum}
					onStartRadio={handleStartRadio}
				/>
			)}
			{!data && query.length < 2 && (
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<SearchIcon className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>
						Search for artists, songs, or albums across all sources
					</p>
				</div>
			)}
		</div>
	);
}
