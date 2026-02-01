import { useState, useCallback } from "react";
import { Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { SearchInput } from "../components/search/SearchInput";
import { SearchResults } from "../components/search/SearchResults";
import { Spinner } from "../components/ui/spinner";

export function SearchPage() {
	const [query, setQuery] = useState("");
	const utils = trpc.useUtils();

	const searchQuery = trpc.search.search.useQuery(
		{ searchText: query },
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

	const handleSearch = useCallback((q: string) => {
		setQuery(q);
	}, []);

	const handleCreateStation = useCallback(
		(musicToken: string) => {
			createStation.mutate({ musicToken });
		},
		[createStation],
	);

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Search</h2>
			<SearchInput
				onSearch={handleSearch}
				placeholder="Search artists, songs, genres..."
			/>
			{searchQuery.isLoading && query.length >= 2 && (
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			)}
			{searchQuery.data && (
				<SearchResults
					{...(searchQuery.data.artists ? { artists: searchQuery.data.artists } : {})}
					{...(searchQuery.data.songs ? { songs: searchQuery.data.songs } : {})}
					{...(searchQuery.data.genreStations ? { genreStations: searchQuery.data.genreStations } : {})}
					onCreateStation={handleCreateStation}
				/>
			)}
			{!searchQuery.data && query.length < 2 && (
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<SearchIcon className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>
						Search for artists, songs, or genres to create a new
						station
					</p>
				</div>
			)}
		</div>
	);
}
