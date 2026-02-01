import { useState, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { SearchInput } from "../components/search/SearchInput";
import { SearchResults } from "../components/search/SearchResults";
import { Spinner } from "../components/ui/spinner";

export function SearchPage() {
	const [query, setQuery] = useState("");

	const searchQuery = trpc.search.search.useQuery(
		{ searchText: query },
		{ enabled: query.length >= 2 },
	);

	const createStation = trpc.stations.create.useMutation({
		onSuccess() {
			// Could show a toast or redirect
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
					artists={searchQuery.data.artists}
					songs={searchQuery.data.songs}
					genreStations={searchQuery.data.genreStations}
					onCreateStation={handleCreateStation}
				/>
			)}
		</div>
	);
}
