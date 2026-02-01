import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "../lib/trpc";
import { StationList } from "../components/stations/StationList";
import { Spinner } from "../components/ui/spinner";
import { Input } from "../components/ui/input";
import type { Station } from "../../types/api";

export function StationsPage() {
	const [filter, setFilter] = useState("");
	const navigate = useNavigate();
	const stationsQuery = trpc.stations.list.useQuery();

	const filteredStations = (stationsQuery.data?.stations ?? []).filter(
		(s) => s.stationName.toLowerCase().includes(filter.toLowerCase()),
	);

	const handleSelect = (station: Station) => {
		navigate({ to: "/now-playing", search: { station: station.stationToken } });
	};

	if (stationsQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (stationsQuery.error) {
		return (
			<div className="flex-1 p-4">
				<p className="text-red-400">
					Failed to load stations: {stationsQuery.error.message}
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">Your Stations</h2>
			<Input
				placeholder="Filter stations..."
				value={filter}
				onChange={(e) => setFilter(e.target.value)}
			/>
			<StationList
				stations={filteredStations}
				onSelect={handleSelect}
			/>
		</div>
	);
}
