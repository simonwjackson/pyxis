import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";

export function GenresPage() {
	const [expanded, setExpanded] = useState<string | null>(null);
	const genresQuery = trpc.genres.list.useQuery();
	const utils = trpc.useUtils();

	const createStation = trpc.stations.create.useMutation({
		onSuccess() {
			toast.success("Station created");
			utils.stations.list.invalidate();
		},
		onError(err) {
			toast.error(`Failed to create station: ${err.message}`);
		},
	});

	if (genresQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	// genres.list returns result.categories, so data IS the categories array
	const categories = genresQuery.data ?? [];

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Genre Stations</h2>
			<div className="space-y-1">
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
							className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--color-bg-highlight)] text-[var(--color-text)] font-medium flex items-center justify-between transition-colors"
							type="button"
						>
							<span>{cat.categoryName}</span>
							{expanded === cat.categoryName ? (
								<ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
							) : (
								<ChevronRight className="w-4 h-4 text-[var(--color-text-dim)]" />
							)}
						</button>
						{expanded === cat.categoryName && (
							<ul className="ml-4 space-y-1 mt-1">
								{cat.stations.map((station) => (
									<li
										key={station.stationToken}
										className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--color-bg-highlight)]"
									>
										<span className="text-sm text-[var(--color-text-muted)]">
											{station.stationName}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="gap-1"
											onClick={() =>
												createStation.mutate({
													musicToken:
														station.stationToken,
												})
											}
										>
											<Plus className="w-3 h-3" />
											Add
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
