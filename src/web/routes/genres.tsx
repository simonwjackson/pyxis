import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";

export function GenresPage() {
	const [expanded, setExpanded] = useState<string | null>(null);
	const genresQuery = trpc.genres.list.useQuery();

	const createStation = trpc.stations.create.useMutation();

	if (genresQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const categories = genresQuery.data?.categories ?? [];

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Genre Stations</h2>
			<div className="space-y-2">
				{categories.map((cat) => (
					<div key={cat.categoryName}>
						<button
							onClick={() =>
								setExpanded(
									expanded === cat.categoryName
										? null
										: cat.categoryName,
								)
							}
							className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-800 text-zinc-200 font-medium flex items-center justify-between"
							type="button"
						>
							<span>{cat.categoryName}</span>
							<span className="text-zinc-500 text-sm">
								{expanded === cat.categoryName ? "\u25BE" : "\u25B8"}
							</span>
						</button>
						{expanded === cat.categoryName && (
							<ul className="ml-4 space-y-1 mt-1">
								{cat.stations.map((station) => (
									<li
										key={station.stationToken}
										className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-zinc-800"
									>
										<span className="text-sm text-zinc-300">
											{station.stationName}
										</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												createStation.mutate({
													musicToken: station.stationToken,
												})
											}
										>
											+ Add
										</Button>
									</li>
								))}
							</ul>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
