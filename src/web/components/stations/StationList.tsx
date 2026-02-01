import { cn } from "../../lib/utils";
import type { Station } from "../../../types/api";

type StationListProps = {
	readonly stations: readonly Station[];
	readonly currentStationId?: string;
	readonly onSelect: (station: Station) => void;
};

export function StationList({
	stations,
	currentStationId,
	onSelect,
}: StationListProps) {
	return (
		<ul className="space-y-1">
			{stations.map((station) => (
				<li key={station.stationId}>
					<button
						onClick={() => onSelect(station)}
						className={cn(
							"w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
							station.stationId === currentStationId
								? "bg-cyan-600/20 text-cyan-400"
								: "text-zinc-300 hover:bg-zinc-800",
							station.isQuickMix && "font-semibold",
						)}
						type="button"
					>
						{station.isQuickMix ? "🔀 " : ""}
						{station.stationName}
					</button>
				</li>
			))}
		</ul>
	);
}
