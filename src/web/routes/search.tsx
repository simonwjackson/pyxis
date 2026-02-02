import { useState, useCallback } from "react";
import { Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { SearchInput } from "../components/search/SearchInput";
import { SearchResults } from "../components/search/SearchResults";
import type { SearchTrack } from "../components/search/SearchResults";
import { Spinner } from "../components/ui/spinner";

export function SearchPage() {
	const [query, setQuery] = useState("");
	const utils = trpc.useUtils();

	const unifiedQuery = trpc.search.unified.useQuery(
		{ query },
		{ enabled: query.length >= 2 },
	);

	const createStation = trpc.radio.create.useMutation({
		onSuccess() {
			toast.success("Station created");
			utils.radio.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create station: ${err.message}`);
		},
	});

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
	});

	const createRadio = trpc.playlist.createRadio.useMutation({
		onSuccess() {
			toast.success("Radio created");
			utils.playlist.list.invalidate();
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
		(albumId: string) => {
			saveAlbum.mutate({ id: albumId });
		},
		[saveAlbum],
	);

	const handleStartRadio = useCallback(
		(track: SearchTrack) => {
			createRadio.mutate({
				trackId: track.id,
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

	const hasResults =
		(data?.tracks && data.tracks.length > 0) ||
		(data?.albums && data.albums.length > 0) ||
		(data?.pandoraArtists && data.pandoraArtists.length > 0) ||
		(data?.pandoraGenres && data.pandoraGenres.length > 0);

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
			{data && !hasResults && <SearchResults.Empty />}
			{data && hasResults && (
				<SearchResults.Root>
					{data.albums.length > 0 && (
						<SearchResults.Albums
							albums={data.albums}
							onSaveAlbum={handleSaveAlbum}
						/>
					)}
					{data.tracks.length > 0 && (
						<SearchResults.Tracks
							tracks={data.tracks}
							onStartRadio={handleStartRadio}
						/>
					)}
					{data.pandoraArtists.length > 0 && (
						<SearchResults.Artists
							artists={data.pandoraArtists}
							onCreateStation={handleCreateStation}
						/>
					)}
					{data.pandoraGenres.length > 0 && (
						<SearchResults.Genres
							genres={data.pandoraGenres}
							onCreateStation={handleCreateStation}
						/>
					)}
				</SearchResults.Root>
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
