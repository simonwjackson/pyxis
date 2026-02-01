import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { trpc } from "../lib/trpc";
import { StationList } from "../components/stations/StationList";
import { StationListSkeleton } from "../components/ui/skeleton";
import { usePlaybackContext } from "../contexts/PlaybackContext";
import type { Station } from "../../types/api";

export function StationsPage() {
	const [filter, setFilter] = useState("");
	const navigate = useNavigate();
	const stationsQuery = trpc.stations.list.useQuery();
	const playback = usePlaybackContext();

	const filteredStations = (stationsQuery.data ?? []).filter(
		(s: Station) =>
			s.stationName.toLowerCase().includes(filter.toLowerCase()),
	);

	const handleSelect = (station: Station) => {
		navigate({
			to: "/now-playing",
			search: { station: station.stationToken },
		});
	};

	if (stationsQuery.isLoading) {
		return <StationListSkeleton />;
	}

	if (stationsQuery.error) {
		return (
			<div className="flex-1 p-4">
				<p className="text-red-400">
					Failed to load stations:{" "}
					{stationsQuery.error.message}
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Your Stations</h2>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
				<input
					type="text"
					placeholder="Filter stations..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					aria-label="Filter stations"
					className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
				/>
			</div>
			<StationList
				stations={filteredStations}
				currentStationToken={playback.currentStationToken ?? undefined}
				onSelect={handleSelect}
			/>
		</div>
	);
}
