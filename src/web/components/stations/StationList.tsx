import { Radio, Shuffle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Station } from "../../../types/api";

type StationListProps = {
	readonly stations: readonly Station[];
	readonly currentStationToken?: string | undefined;
	readonly onSelect: (station: Station) => void;
};

export function StationList({
	stations,
	currentStationToken,
	onSelect,
}: StationListProps) {
	if (stations.length === 0) {
		return (
			<p className="text-zinc-500 text-sm py-4 text-center">
				No stations found.
			</p>
		);
	}

	return (
		<ul className="space-y-1">
			{stations.map((station) => {
				const isActive = station.stationToken === currentStationToken;
				return (
					<li key={station.stationId}>
						<button
							onClick={() => onSelect(station)}
							className={cn(
								"w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors group",
								isActive
									? "bg-cyan-500/10 border border-cyan-500/30"
									: "hover:bg-zinc-800",
							)}
							type="button"
						>
							<div
								className={cn(
									"w-10 h-10 rounded flex items-center justify-center shrink-0",
									station.isQuickMix
										? "bg-purple-500/20"
										: isActive
											? "bg-cyan-500/20"
											: "bg-zinc-800",
								)}
							>
								{station.isQuickMix ? (
									<Shuffle
										className={cn(
											"w-5 h-5",
											isActive
												? "text-purple-400"
												: "text-purple-400",
										)}
									/>
								) : (
									<Radio
										className={cn(
											"w-5 h-5",
											isActive
												? "text-cyan-400"
												: "text-zinc-500",
										)}
									/>
								)}
							</div>
							<div className="flex-1 min-w-0">
								<p
									className={cn(
										"font-medium truncate",
										isActive
											? "text-zinc-100"
											: "text-zinc-300",
									)}
								>
									{station.stationName}
								</p>
								{station.isQuickMix && (
									<p className="text-sm text-purple-400">
										QuickMix
									</p>
								)}
								{isActive && !station.isQuickMix && (
									<p className="text-sm text-cyan-400">
										Now playing
									</p>
								)}
							</div>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
