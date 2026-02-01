import { useState } from "react";
import { Radio, Shuffle, MoreVertical } from "lucide-react";
import { cn } from "../../lib/utils";
import { StationContextMenu } from "./StationContextMenu";
import type { Station } from "../../../types/api";

type StationListProps = {
	readonly stations: readonly Station[];
	readonly currentStationToken?: string | undefined;
	readonly onSelect: (station: Station) => void;
	readonly onDetails: (station: Station) => void;
	readonly onRename: (station: Station) => void;
	readonly onDelete: (station: Station) => void;
};

export function StationList({
	stations,
	currentStationToken,
	onSelect,
	onDetails,
	onRename,
	onDelete,
}: StationListProps) {
	const [openMenuToken, setOpenMenuToken] = useState<string | null>(null);

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
				const isMenuOpen = openMenuToken === station.stationToken;
				return (
					<li key={station.stationId}>
						<div
							className={cn(
								"flex items-center gap-3 p-3 rounded-lg transition-colors group",
								isActive
									? "bg-cyan-500/10 border border-cyan-500/30"
									: "hover:bg-zinc-800",
							)}
						>
							<button
								onClick={() => onSelect(station)}
								className="flex items-center gap-3 flex-1 min-w-0 text-left"
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

							<div className="relative">
								<button
									type="button"
									onClick={() =>
										setOpenMenuToken(
											isMenuOpen
												? null
												: station.stationToken,
										)
									}
									className="p-1.5 rounded hover:bg-zinc-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
									aria-label={`Actions for ${station.stationName}`}
								>
									<MoreVertical className="w-4 h-4 text-zinc-400" />
								</button>

								{isMenuOpen && (
									<StationContextMenu
										allowDelete={
											station.allowDelete ?? false
										}
										allowRename={
											station.allowRename ?? false
										}
										onDetails={() => {
											setOpenMenuToken(null);
											onDetails(station);
										}}
										onRename={() => {
											setOpenMenuToken(null);
											onRename(station);
										}}
										onDelete={() => {
											setOpenMenuToken(null);
											onDelete(station);
										}}
										onClose={() =>
											setOpenMenuToken(null)
										}
									/>
								)}
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
